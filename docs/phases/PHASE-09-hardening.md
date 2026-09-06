# PHASE 09 — Search, hardening & deployment

**Goal:** turn a working app into one you would trust with a year of your own
notes, and one someone else can deploy from the README in twenty minutes.

**Prerequisites:** Phases 01–08.

## Scope

1. **Search** — Postgres full-text with `pg_trgm` and `unaccent`.
   - A generated, unaccented `tsvector` column on documents (title + tags),
     note pages (content), annotations (`quotedText`) and comments (body).
   - GIN indexes; a materialised search view is _not_ needed at this size.
   - `GET /api/search` grouped by type per `API.md`.
   - **`perche` must find `perché`, `etudier` must find `étudier`** — this is
     an app for Italian and French and accent-insensitivity is a requirement,
     not a nicety.
   - Search UI per design brief §5.12; wired into the ⌘K palette.
2. **Rate limiting** — the full table in `API.md` §Rate limits, Postgres token
   bucket, with `Retry-After` and a friendly 429 UI.
3. **Security pass**
   - CSP with no `unsafe-eval` except the pdf.js worker; `frame-ancestors
'none'`; HSTS; `X-Content-Type-Options`; Referrer-Policy.
   - User-uploaded files served from a **separate origin/bucket domain**, with
     `Content-Disposition: attachment` for anything not PDF or image.
   - Re-run the tenancy suite; add an IDOR fuzz test that walks every
     `/api/**` route with ids belonging to a second seeded user.
   - `npm audit` / `osv-scanner` in CI, failing on high severity.
   - Secrets are never logged; add a pino redaction list.
4. **Performance pass**
   - Bundle budget enforced in CI: viewer route ≤250 KB gzipped first-load JS
     excluding pdf.js.
   - `EXPLAIN ANALYZE` on the ten hottest queries; add only the indexes the
     plans justify, and record them in `DATA_MODEL.md §8`.
   - Verify the RSS budget in `ARCHITECTURE.md §6` with a load script:
     3 concurrent users, 1 conversion, 200-page document open — peak under
     1.4 GB.
   - Response compression, `Cache-Control` on immutable assets, `next/image`
     for thumbnails.
5. **Reliability**
   - `/api/health` wired to the container healthcheck; `/api/metrics` behind a
     bearer token.
   - Job failure surfaces on the affected document and in an admin-ish
     "problems" list in settings.
   - Nightly `pg_dump | zstd` to object storage, 14 daily + 8 weekly.
   - **`docs/RUNBOOK.md`**: restore from backup (with a rehearsed drill and its
     measured RTO), rotate secrets, clear a stuck job, free disk, roll back a
     deploy.
6. **Deployment**
   - Multi-stage `Dockerfile` for web (slim) and worker (with LibreOffice,
     qpdf, ocrmypdf, fonts).
   - Production `docker-compose.yml` with Caddy, automatic TLS, and healthchecks
     with sane restart policies.
   - Migrations run once at startup behind a Postgres advisory lock.
   - A CI job that boots the whole compose stack on a clean runner and runs the
     E2E smoke suite against it.
7. **Polish**
   - Every empty, loading, error and offline state from the design brief
     actually implemented — audit them against §5 screen by screen.
   - Keyboard shortcut sheet (`?`), skip links, `prefers-reduced-motion`
     honoured everywhere.
   - i18n scaffolding (`next-intl`) with English extracted; Italian and French
     UI translations as the first candidates.
   - `SECURITY.md`, `CONTRIBUTING.md`, and README screenshots or a short GIF of
     the viewer — this repo is a portfolio piece and the first screen someone
     sees is the README.

## Acceptance criteria

- [ ] Searching `perche` returns note pages containing `perché`; searching
      `etudier` returns `étudier`; both under 200 ms p95 on a 5,000-document
      seed.
- [ ] The IDOR fuzz test passes across every `/api/**` route.
- [ ] Lighthouse: performance ≥90, accessibility ≥95, best-practices ≥95, PWA
      installable — on the dashboard _and_ the viewer.
- [ ] Bundle budget enforced and passing.
- [ ] A restore-from-backup drill is documented in `RUNBOOK.md` with a real
      measured time, performed at least once.
- [ ] `docker compose up` on a clean 2 GB VPS with only a `.env` produces a
      working, TLS-terminated app — verified by the CI compose job.
- [ ] Peak RSS under the load script stays below 1.4 GB.
- [ ] Every screen in the design brief has its empty, loading and error states
      implemented — checked off one by one in the PR body.
