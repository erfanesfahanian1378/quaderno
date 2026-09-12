# Deploying Quaderno

One server, five containers, one command. Caddy gets a real Let's Encrypt
certificate on its own, which is the point at which every mkcert instruction in
the in-app Setup guide stops applying — a public certificate needs nothing
installed on the phone.

Target is a 2-core / 12 GB arm64 box (Oracle Ampere Always Free), but nothing
here is Oracle-specific; a €6 x86 VPS runs the same files unchanged.

---

## 1. The server

Ubuntu 24.04. As root:

```bash
apt update && apt install -y docker.io docker-compose-v2 git
systemctl enable --now docker
```

**Open the firewall — both of them.** Cloud VMs have a firewall in the
provider's console *and* one on the machine, and only fixing one is the most
common reason a fresh deploy times out with no logs anywhere:

```bash
# On the machine. Oracle's Ubuntu images ship iptables rules that drop 80/443.
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save
```

Then, in the provider's console, add ingress rules for TCP 80 and 443 from
`0.0.0.0/0` (Oracle: Networking → your VCN → Security Lists → Default).

## 2. DNS

Point an A record at the server's public IP **before** the first start. Caddy
requests a certificate on the first request for that name; if DNS is not
resolving yet the request fails and Let's Encrypt rate-limits retries, so a
wrong-order start costs an hour of waiting rather than a restart.

```bash
dig +short quaderno.example.com   # must print the server's IP
```

## 3. The code and the secrets

```bash
git clone https://github.com/<you>/quaderno.git
cd quaderno
cp .env.prod.example .env.prod
```

Fill in `.env.prod`. Generate every secret rather than inventing one:

```bash
openssl rand -base64 32     # AUTH_SECRET, POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY
npx web-push generate-vapid-keys   # the two VAPID keys, if you want reminders
```

`DOMAIN` takes no scheme and no trailing slash. `.env.prod` is gitignored and
should never leave the server.

## 4. Start

```bash
docker compose --env-file .env.prod -f compose.prod.yml up -d --build
```

**`--env-file` is not optional.** `env_file:` inside the compose file passes
variables to the *containers*; it does nothing for the `${DOMAIN}` substitutions
in the compose file itself, which are read from the shell or from `--env-file`.
Without it the start fails with `required variable DOMAIN is missing a value`.

The first build takes 10–20 minutes: LibreOffice and the Tesseract language
packs are most of a 2 GB image. Later builds reuse the cache.

Watch it come up:

```bash
docker compose --env-file .env.prod -f compose.prod.yml ps
docker compose --env-file .env.prod -f compose.prod.yml logs -f web worker
```

`migrate` runs `prisma migrate deploy` once and exits — that is success, not a
crash. `web` and `worker` wait for it.

## 5. Check it

```bash
curl -fsS https://quaderno.example.com/api/health
# {"status":"ok","db":true,"storage":true,"queueDepth":0,...}
```

Then open the site, create an account, upload a PDF, and confirm the tile turns
from *converting…* into a thumbnail. That single act exercises the whole
stack: web, presigned upload, MinIO, the queue, the worker, LibreOffice and
poppler.

---

## Updating

```bash
git pull
docker compose --env-file .env.prod -f compose.prod.yml up -d --build
```

Migrations run automatically before the new web container starts.

## Backups

Everything that matters is in two volumes: `quaderno_db-data` and
`quaderno_minio-data`. The database is the one that cannot be reconstructed.

```bash
docker compose --env-file .env.prod -f compose.prod.yml exec -T db \
  pg_dump -U quaderno quaderno | gzip > ~/quaderno-$(date +%F).sql.gz
```

A dump you have never restored is a hope, not a backup. Restore one into a
scratch database at least once.

## Memory

On a 12 GB box the whole stack idles around 1 GB. The worker is capped at 3 GB
in compose because LibreOffice can take a great deal of memory on a
pathological file, and the cap means it cannot take the database down with it.

If you enable the local translator (`--profile translate`), add ~1 GB.

---

## Notes that will save an afternoon

**Presigned URLs are signed over the host.** `S3_PUBLIC_ENDPOINT` must be the
address a *browser* reaches, which is why it is `https://$DOMAIN/s3` and Caddy
proxies that path to MinIO. Point it at `minio:9000` and every PDF fails with
403 SignatureDoesNotMatch, which looks exactly like a corrupt file.

**Oracle Always Free reclaims idle instances.** Over any 7-day window, if CPU,
network *and* memory are all under 20%, the instance can be taken back — and
this app is comfortably under all three. Upgrading the account to Pay As You
Go exempts it, and Always Free resources remain free. Do that before you rely
on the box.

**Blank is unset.** `FOO=""` in `.env.prod` is treated as absent, so optional
settings can be left as empty placeholders without failing validation.
