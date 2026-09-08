/**
 * An HTTPS front door for the dev server, so a phone on the LAN gets a
 * SECURE CONTEXT.
 *
 * Browsers expose `serviceWorker`, `caches`, `PushManager`, `getUserMedia` and
 * `crypto.randomUUID` only on a secure context: HTTPS, or localhost. On
 * `http://192.168.x.x` those APIs are not merely blocked, they are absent —
 * measured, not assumed:
 *
 *   localhost:3000       secure: true    serviceWorker: yes
 *   192.168.1.235:3000   secure: false   serviceWorker: NO
 *
 * So offline mode, reminders and recording cannot work on a phone over the LAN
 * IP, however correct the code is. This proxy terminates TLS with an mkcert
 * certificate and forwards to the dev server, which fixes all of them at once.
 *
 *   pnpm dev            # terminal 1, the app on :3000
 *   pnpm https           # terminal 2, this, on :3443
 *
 * Then open https://<your-lan-ip>:3443 on the phone. It needs mkcert's root
 * certificate installed once — this serves it at /mkcert-root.crt.
 */
import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.HTTPS_PORT ?? 3443);
const TARGET_PORT = Number(process.env.PORT ?? 3000);

/*
 * Object storage needs TLS as well, and this is not optional once the app has
 * it.
 *
 * A page on https cannot load a PDF from http — the browser blocks it as mixed
 * content, and pdf.js reports nothing useful:
 *
 *   Mixed Content: The page at 'https://192.168.1.235:3443/d/…' was loaded
 *   over HTTPS, but requested an insecure resource 'http://192.168.1.235:9000/…'
 *
 * The result is a viewer full of blank grey pages with the network working
 * perfectly. So MinIO gets a TLS front door too, and S3_PUBLIC_ENDPOINT points
 * at it.
 *
 * Presigned URLs survive this because SigV4 covers the Host header and the
 * proxy forwards it untouched: the signature is computed for
 * `192.168.1.235:9443`, MinIO validates against the same string, and they
 * match. Rewriting the host instead of preserving it would break every URL.
 */
const S3_PORT = Number(process.env.HTTPS_S3_PORT ?? 9443);
const S3_TARGET_PORT = Number(process.env.S3_PORT ?? 9000);
const CERT_DIR = join(process.cwd(), "certs");

const CERT = join(CERT_DIR, "local.pem");
const KEY = join(CERT_DIR, "local-key.pem");

if (!existsSync(CERT) || !existsSync(KEY)) {
  console.error(
    `No certificate in ${CERT_DIR}.\n\n` +
      `  brew install mkcert\n` +
      `  mkcert -install\n` +
      `  mkcert -cert-file certs/local.pem -key-file certs/local-key.pem <your-lan-ip> localhost 127.0.0.1\n`,
  );
  process.exit(1);
}

/** mkcert's root, so a phone can be told to trust these certificates. */
function rootCertificate() {
  const root = join(
    process.env.HOME ?? "",
    "Library/Application Support/mkcert/rootCA.pem",
  );
  return existsSync(root) ? readFileSync(root) : null;
}

function proxyTo(targetPort, { serveRootCertificate = false } = {}) {
  return (incoming, outgoing) => {
    /*
     * The root certificate, so the phone can install it without a cable or a
     * file transfer. Served as `application/x-x509-ca-cert`, which is what
     * makes Android offer to install it rather than display it as text.
     */
    if (serveRootCertificate && incoming.url === "/mkcert-root.crt") {
      const root = rootCertificate();
      if (!root) {
        outgoing.writeHead(404).end("mkcert root not found on this machine");
        return;
      }
      outgoing.writeHead(200, {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition": 'attachment; filename="mkcert-root.crt"',
      });
      outgoing.end(root);
      return;
    }

    const proxied = httpRequest(
      {
        host: "127.0.0.1",
        port: targetPort,
        method: incoming.method,
        path: incoming.url,
        headers: {
          /*
           * The Host header is passed through UNCHANGED. The dev server needs
           * it so the urls it builds point back through the proxy — and MinIO
           * needs it because SigV4 signs it, so rewriting it would invalidate
           * every presigned url.
           */
          ...incoming.headers,
          host: incoming.headers.host ?? `localhost:${targetPort}`,
          "x-forwarded-proto": "https",
        },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );

    proxied.on("error", () => {
      if (outgoing.headersSent) {
        outgoing.destroy();
        return;
      }
      outgoing
        .writeHead(502, { "Content-Type": "text/plain" })
        .end(`Nothing is listening on :${targetPort}.`);
    });

    /*
     * A phone that walks out of wifi range resets the connection mid-response.
     * Node turns that into an 'error' event on the socket, and an unhandled
     * one takes the whole process down — so the proxy would die exactly when
     * someone was testing what happens when the network drops.
     */
    incoming.on("error", () => proxied.destroy());
    outgoing.on("error", () => proxied.destroy());

    incoming.pipe(proxied);
  };
}

const credentials = { cert: readFileSync(CERT), key: readFileSync(KEY) };

const server = createServer(
  credentials,
  proxyTo(TARGET_PORT, { serveRootCertificate: true }),
);

/** The same treatment for object storage, so PDFs are not mixed content. */
const storage = createServer(credentials, proxyTo(S3_TARGET_PORT));

/*
 * WebSocket upgrades, which Next's hot reload uses. Without this the page
 * loads but every edit needs a manual refresh, and the console fills with
 * failed socket attempts.
 */
server.on("upgrade", (incoming, socket, head) => {
  const proxied = httpRequest({
    host: "127.0.0.1",
    port: TARGET_PORT,
    method: incoming.method,
    path: incoming.url,
    headers: incoming.headers,
  });

  proxied.on("upgrade", (response, upstream, upstreamHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(response.headers)
          .map(([key, value]) => `${key}: ${String(value)}\r\n`)
          .join("") +
        "\r\n",
    );
    if (upstreamHead?.length) upstream.unshift(upstreamHead);
    upstream.pipe(socket).pipe(upstream);
  });

  proxied.on("error", () => socket.destroy());
  socket.on("error", () => proxied.destroy());
  if (head?.length) proxied.write(head);
  proxied.end();
});

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal)
        return address.address;
    }
  }
  return "localhost";
}

/*
 * Last resort. A dropped connection must never take the proxy with it — a
 * crash here means every device on the network loses the app at once, and the
 * cause looks like the app rather than the tunnel in front of it.
 */
server.on("clientError", (_error, socket) => socket.destroy());
storage.on("clientError", (_error, socket) => socket.destroy());
process.on("uncaughtException", (error) => {
  console.error(`[https] ignored: ${error.message}`);
});

storage.listen(S3_PORT, "0.0.0.0");

server.listen(PORT, "0.0.0.0", () => {
  const host = lanAddress();
  console.log(`\n  https://${host}:${PORT}        ← open this on the phone`);
  console.log(
    `  https://${host}:${PORT}/mkcert-root.crt   ← install this first\n`,
  );
  console.log(`  app      → http://127.0.0.1:${TARGET_PORT}`);
  console.log(
    `  storage  → http://127.0.0.1:${S3_TARGET_PORT}  (tls on ${S3_PORT})`,
  );
  console.log(
    `\n  S3_PUBLIC_ENDPOINT must be https://${host}:${S3_PORT} — a plain-http\n` +
      `  endpoint is blocked as mixed content and every page renders blank.\n`,
  );
});
