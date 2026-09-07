/* eslint-disable no-undef */
/**
 * Quaderno's service worker. PHASE-13.
 *
 * Hand-rolled rather than Workbox: this is the whole caching story and it is
 * about 150 lines, against a build-tool dependency and a generated file
 * nobody reads.
 *
 * The one thing to understand before changing anything here: **pdf.js
 * requests BYTE RANGES, not whole files.** A naive cache stores two hundred
 * partial 206 responses per document and can satisfy none of them, because
 * the next request asks for a different range. So a document is cached as one
 * complete body, keyed by its documentId, and range requests are served by
 * slicing that body ourselves.
 */

const VERSION = "v1";
const SHELL = `quaderno-shell-${VERSION}`;
const DOCS = `quaderno-docs-${VERSION}`;

/** ARCHITECTURE.md §5: 200 MB, LRU. */
const MAX_DOC_BYTES = 200 * 1024 * 1024;

const SHELL_URLS = ["/", "/dashboard", "/library", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * The page asks us to keep a document. It hands over the signed URL, which is
 * short-lived — we fetch it NOW and store the body under a stable key, so the
 * expiry never matters again.
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "cache-document") {
    event.waitUntil(cacheDocument(data.documentId, data.url));
  }
  if (data.type === "drop-document") {
    event.waitUntil(
      Promise.all([
        caches.open(DOCS).then((cache) => cache.delete(docKey(data.documentId))),
        caches
          .open(SHELL)
          .then((cache) =>
            cache.delete(
              new URL(`/d/${data.documentId}`, self.location.origin).toString(),
            ),
          ),
      ]),
    );
  }
});

function docKey(documentId) {
  // A stable, same-origin key. NOT the signed URL: that changes every five
  // minutes and would never produce a hit.
  return new Request(`/__cached-document__/${documentId}`);
}

async function cacheDocument(documentId, url) {
  try {
    /*
     * The document's PAGE, not only its bytes.
     *
     * /d/[id] is a dynamic server-rendered route, so there is nothing to
     * pre-cache at install time and no amount of cached PDF helps if the HTML
     * that renders it cannot load. Caching the navigation response here is
     * what actually makes a document openable in a tunnel.
     *
     * `credentials: "include"` because the route is behind a session.
     */
    const pageUrl = new URL(`/d/${documentId}`, self.location.origin);
    const page = await fetch(pageUrl, { credentials: "include" });
    if (page.ok) {
      const shell = await caches.open(SHELL);
      await shell.put(pageUrl.toString(), page.clone());
    }

    const response = await fetch(url);
    if (!response.ok) return;

    const body = await response.arrayBuffer();
    const cache = await caches.open(DOCS);

    await cache.put(
      docKey(documentId),
      new Response(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(body.byteLength),
          "X-Cached-At": String(Date.now()),
        },
      }),
    );

    await evictIfOver(cache);

    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: "document-cached", documentId });
    }
  } catch {
    // Offline, or the URL expired between issue and use. Nothing to do — the
    // page already knows it is not cached.
  }
}

/** Least-recently-cached eviction. `caches` has no size API, so we measure. */
async function evictIfOver(cache) {
  const requests = await cache.keys();

  const entries = await Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request);
      return {
        request,
        size: Number(response?.headers.get("Content-Length") ?? 0),
        cachedAt: Number(response?.headers.get("X-Cached-At") ?? 0),
      };
    }),
  );

  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (total <= MAX_DOC_BYTES) return;

  for (const entry of entries.sort((a, b) => a.cachedAt - b.cachedAt)) {
    if (total <= MAX_DOC_BYTES) break;
    await cache.delete(entry.request);
    total -= entry.size;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // A document's bytes. Serve from cache when we have them, including
  // satisfying byte ranges ourselves.
  const cachedDoc = url.searchParams.get("__doc");
  if (cachedDoc) {
    event.respondWith(serveDocument(cachedDoc, request));
    return;
  }

  // Same-origin immutable build output: cache-first, it never changes.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static")) {
    event.respondWith(cacheFirst(SHELL, request));
    return;
  }

  // Navigations: network-first with the shell as the fallback, so going
  // offline lands on a real page rather than the browser's dinosaur.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        // `ignoreSearch` because a viewer URL may carry params the cached
        // copy does not, and the page is the same either way.
        const exact = await caches.match(request, { ignoreSearch: true });
        if (exact) return exact;

        const shell =
          (await caches.match("/dashboard")) ?? (await caches.match("/"));
        return shell ?? Response.error();
      }),
    );
    return;
  }

  /*
   * API reads the offline viewer depends on: annotations, and the signed URL
   * it will not be able to refresh. Network-first, then whatever we last saw
   * — a stale annotation list is far better than a broken page, and the
   * outbox reconciles on reconnect anyway.
   */
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/documents/")) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(SHELL);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? Response.error()),
    );
    return;
  }
});

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Serves a cached PDF, honouring `Range`.
 *
 * This is the part that makes offline reading work at all: pdf.js will ask
 * for `bytes=0-65535`, then some other window, and expects a 206 each time.
 */
async function serveDocument(documentId, request) {
  const cache = await caches.open(DOCS);
  const cached = await cache.match(docKey(documentId));

  if (!cached) {
    // Not kept offline. Fall through to the network, which is the honest
    // answer — and fails visibly when there is none.
    return fetch(request);
  }

  const body = await cached.arrayBuffer();
  const range = request.headers.get("Range");

  if (!range) {
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(body.byteLength),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : body.byteLength - 1;
  const slice = body.slice(start, end + 1);

  return new Response(slice, {
    status: 206,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(slice.byteLength),
      "Content-Range": `bytes ${start}-${end}/${body.byteLength}`,
      "Accept-Ranges": "bytes",
    },
  });
}
