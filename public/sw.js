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

/*
 * v2 — PHASE-16.
 *
 * The bump is load-bearing, not cosmetic. Every v1 install cached the SIGN-IN
 * page under `/dashboard` and `/library` (see PRECACHE below), and the
 * activate handler deletes any cache whose name does not end in the current
 * version. Without the bump the fix reaches nobody who already used the app.
 */
const VERSION = "v2";
const SHELL = `quaderno-shell-${VERSION}`;
const DOCS = `quaderno-docs-${VERSION}`;
const PAGES = `quaderno-pages-${VERSION}`;

/** ARCHITECTURE.md §5: 200 MB, LRU. */
const MAX_DOC_BYTES = 200 * 1024 * 1024;

/**
 * Cached pages are capped by COUNT, not bytes.
 *
 * `/library` varies by `?languageId=&folderId=`, so the key space is unbounded
 * — without a cap, a few minutes of clicking through folders fills the origin's
 * storage quota with HTML.
 */
const MAX_PAGES = 50;

/** When a page was stored, so the reader can be told how stale it is. */
const CACHED_AT = "x-quaderno-cached-at";

/**
 * Which pages are worth keeping.
 *
 * `/search` is absent on purpose: a search box that cannot search is worse
 * than one that says it needs a connection. `/settings` too — every control on
 * it writes to the server.
 */
const CACHEABLE_PAGES = [
  "/dashboard",
  "/library",
  "/review",
  "/schedule",
  "/stats",
  "/d/",
];

/**
 * PUBLIC urls only.
 *
 * This list used to include `/dashboard` and `/library`. Install runs when the
 * worker registers, which is BEFORE anyone signs in — so `cache.addAll`
 * followed the redirect to `/sign-in` and stored the sign-in page under those
 * keys. Offline, the fallback then handed a redirected response to a
 * navigation, which browsers refuse outright, and every route died with
 * ERR_FAILED.
 *
 * Authenticated routes are cached at runtime instead, after a real
 * authenticated navigation, where the response is the page and not a redirect.
 */
const PRECACHE = ["/offline.html", "/manifest.webmanifest"];

/**
 * Where a navigation goes when there is nothing cached for it.
 *
 * A plain HTML file, not a route. As a Next page it loaded and then threw
 * ChunkLoadError, because its JavaScript bundle had never been cached — the
 * reader had never visited it while online. A fallback that needs the
 * framework's chunk graph fails at exactly the moment it exists for.
 *
 * `/` is deliberately NOT precached: it redirects to /dashboard for a
 * signed-in visitor, and a redirected response cannot be served to a
 * navigation.
 */
const FALLBACK = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

/**
 * Fetch each precache url individually and keep only what is safe to keep.
 *
 * Not `cache.addAll`, which cannot filter: it stores whatever comes back,
 * redirects included. `/` redirects to `/dashboard` for a signed-in visitor,
 * so `addAll` would put a redirected response in the cache and serving it to a
 * navigation fails the load outright — the same fault that broke `/dashboard`
 * in v1, one url along.
 *
 * One failure does not fail the install. A worker that refuses to install
 * because the network hiccuped once is worse than one with a thin cache.
 */
async function precache() {
  const cache = await caches.open(SHELL);

  await Promise.all(
    PRECACHE.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok || response.redirected) return;
        await cache.put(url, response);
      } catch {
        // Offline at install, or the url moved. Neither is fatal.
      }
    }),
  );
}

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
        forgetDocument(data.documentId),
        caches.open(DOCS).then((cache) => cache.delete(docKey(data.documentId))),
        caches
          .open(PAGES)
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

/*
 * Which object paths belong to which document.
 *
 * This used to be a `__doc=<id>` query parameter on the PDF URL. That was
 * wrong in a way that only shows up against a real S3: the URL is presigned
 * with SigV4, which signs the WHOLE canonical query string, so appending
 * anything to it makes every request 403 SignatureDoesNotMatch. The marker
 * has to live somewhere the signature does not cover, and the signed URL has
 * no such place — so it lives here instead, keyed by the object's pathname,
 * which is the one part of a presigned URL that does not change between
 * signings.
 */
const INDEX_KEY = "/__document-index__";
let docIndex = null;

async function loadIndex() {
  if (docIndex) return docIndex;
  docIndex = new Map();
  try {
    const cache = await caches.open(DOCS);
    const stored = await cache.match(INDEX_KEY);
    if (stored) docIndex = new Map(Object.entries(await stored.json()));
  } catch {
    // A corrupt index is not worth failing a fetch over; an empty one just
    // means everything goes to the network.
  }
  return docIndex;
}

async function saveIndex(index) {
  const cache = await caches.open(DOCS);
  await cache.put(
    INDEX_KEY,
    new Response(JSON.stringify(Object.fromEntries(index)), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function rememberPath(url, documentId) {
  const index = await loadIndex();
  index.set(new URL(url).pathname, documentId);
  await saveIndex(index);
}

async function forgetDocument(documentId) {
  const index = await loadIndex();
  for (const [path, id] of index) if (id === documentId) index.delete(path);
  await saveIndex(index);
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
    // Through the same path as any other page, so it gets the same redirect
    // refusal and the same staleness stamp.
    await rememberPage(new Request(pageUrl.toString()), page);

    const response = await fetch(url);
    if (!response.ok) return;

    await rememberPath(url, documentId);

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
  // The index is bookkeeping, not payload. It carries no X-Cached-At, so it
  // would sort oldest-first and be the very first thing evicted — which would
  // leave every cached body in place but unreachable.
  const requests = (await cache.keys()).filter(
    (request) => !new URL(request.url).pathname.startsWith(INDEX_KEY),
  );

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

  /*
   * A document's bytes, served from cache when we have them — byte ranges
   * included. Object storage is a different origin and the keys end in .pdf,
   * which is enough of a filter to keep every other cross-origin request out
   * of the async index lookup.
   *
   * Note what is NOT happening: the request is passed through untouched. A
   * presigned URL cannot survive being decorated (see the index above).
   */
  if (url.origin !== self.location.origin && url.pathname.endsWith(".pdf")) {
    event.respondWith(maybeServeDocument(url.pathname, request));
    return;
  }

  // Same-origin immutable build output: cache-first, it never changes.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static")) {
    event.respondWith(cacheFirst(SHELL, request));
    return;
  }

  // Navigations: network-first, cache the result, fall back to that cache.
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
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
 * A page request.
 *
 * Network first: a page is only worth serving from cache when there is no
 * network, because everything on it — due counts, the schedule, the library —
 * is live data. On success it is stored so the next offline visit has it.
 */
async function handleNavigation(request) {
  let response;

  /*
   * ONLY the fetch is allowed to mean "offline".
   *
   * Caching used to happen inside this try, and anything it threw — a storage
   * quota, a failed body read, a cache the browser declined to write — landed
   * in the catch below and served the OFFLINE PAGE to someone with a perfectly
   * good connection. That is exactly what happened on a phone: the network was
   * fine, the response was fine, and the worker announced there was no
   * connection because writing to the cache had failed.
   *
   * So the two are separated. A caching failure costs the next offline visit;
   * it must never cost this one.
   */
  try {
    response = await fetch(request);
  } catch {
    return offlineResponse(request);
  }

  /*
   * Cloned synchronously, cached in the background, NOT awaited.
   *
   * Awaiting it buffered the entire page before the browser saw a single byte,
   * which on a phone over wifi is a visible delay — and worse, reading a
   * streamed clone to completion is exactly where it used to fail.
   */
  const copy = response.clone();
  rememberPage(request, copy).catch(() => {
    // Best effort, always. A page that cannot be cached is still a page that
    // must be shown.
  });

  return response;
}

/** What to serve when the network genuinely is not there. */
async function offlineResponse(request) {
  const cached = await servePageFromCache(request);
  if (cached) return cached;

  /*
   * REDIRECT to /offline rather than serving its HTML here.
     *
   * Next's client router compares the URL it is on with the payload it was
   * given. Handing the /offline document back under /stats hydrates the wrong
   * route and throws "a client-side exception has occurred" — a worse failure
   * than the one being handled.
   *
   * A redirect the worker CREATES is fine; it is a cached response that
   * already followed one that navigations refuse.
   */
  const url = new URL(request.url);
  if (url.pathname === FALLBACK) {
    return (
      (await rebuildForNavigation(await caches.match(FALLBACK))) ??
      Response.error()
    );
  }

  return Response.redirect(new URL(FALLBACK, url.origin).toString(), 302);
}

/**
 * Store a page for the next time there is no network.
 *
 * Redirects are refused, and that refusal is the whole fix. A response that
 * followed a redirect keeps `redirected: true` through the cache, and handing
 * one to a navigation makes the browser fail the whole load with an opaque
 * ERR_FAILED. That is how the sign-in page, cached under `/dashboard`, turned
 * every offline route into a dead tab.
 */
async function rememberPage(request, response) {
  // The response passed in is already a clone this function owns, so it reads
  // the body directly rather than cloning again.
  if (!response.ok || response.redirected) return;
  if (response.type !== "basic") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE_PAGES.some((prefix) => url.pathname.startsWith(prefix))) return;

  // Stamped so the page can tell the reader how old it is.
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT, new Date().toISOString());

  const stored = new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  const cache = await caches.open(PAGES);
  await cache.put(request.url, stored);
  await trimPages(cache);
}

async function servePageFromCache(request) {
  const cache = await caches.open(PAGES);

  // Exact url first — `/library?folderId=x` and `/library` are different
  // pages. `ignoreSearch` only as a fallback, so a viewer link carrying an
  // unfamiliar parameter still opens.
  const hit =
    (await cache.match(request.url)) ??
    (await cache.match(request, { ignoreSearch: true }));

  return rebuildForNavigation(hit);
}

/**
 * Rebuild a cached response so a navigation will accept it.
 *
 * Even a correctly cached response carries `redirected` and a `url`, and the
 * navigation boundary rejects both. A fresh Response over the same body has
 * neither.
 */
async function rebuildForNavigation(cached) {
  if (!cached) return null;
  return new Response(await cached.blob(), {
    status: cached.status,
    statusText: cached.statusText,
    headers: cached.headers,
  });
}

/** Oldest-first eviction, by the timestamp stored with each page. */
async function trimPages(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_PAGES) return;

  const entries = await Promise.all(
    keys.map(async (key) => {
      const response = await cache.match(key);
      return { key, at: Date.parse(response?.headers.get(CACHED_AT) ?? "") || 0 };
    }),
  );

  entries.sort((a, b) => a.at - b.at);
  for (const entry of entries.slice(0, entries.length - MAX_PAGES)) {
    await cache.delete(entry.key);
  }
}

/**
 * Serves a cached PDF, honouring `Range`.
 *
 * This is the part that makes offline reading work at all: pdf.js will ask
 * for `bytes=0-65535`, then some other window, and expects a 206 each time.
 */
async function maybeServeDocument(pathname, request) {
  const index = await loadIndex();
  const documentId = index.get(pathname);
  if (!documentId) return fetch(request);
  return serveDocument(documentId, request);
}

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

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/**
 * A reminder arriving while the app is closed.
 *
 * This is the entire reason reminders go through Web Push rather than a timer
 * in the page: a timer only runs while a tab is open, and the whole point of
 * "ten minutes before your class" is being told when you are not looking.
 *
 * `event.waitUntil` is not optional. Without it the service worker can be
 * killed the moment this handler returns, before the notification is shown —
 * and on a phone that is most of the time.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with no readable payload still deserves to surface: something was
    // sent, and silence would look like the feature is broken.
  }

  const title = payload.title || "Quaderno";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      // Same tag replaces rather than stacks, so a class cannot fill the
      // lock screen with itself.
      tag: payload.tag || "quaderno",
      renotify: Boolean(payload.tag),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/dashboard" },
    }),
  );
});

/**
 * Tapping the notification.
 *
 * Focuses an already-open tab rather than opening a second one — a reminder
 * that leaves four copies of the app behind is its own annoyance. An external
 * meeting link is the exception and always opens fresh.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data?.url || "/dashboard";
  const external = /^https?:\/\//i.test(target);

  event.waitUntil(
    (async () => {
      if (external) {
        await self.clients.openWindow(target);
        return;
      }

      const url = new URL(target, self.location.origin);
      const open = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of open) {
        if (new URL(client.url).origin !== url.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(url.toString());
        return;
      }

      await self.clients.openWindow(url.toString());
    })(),
  );
});
