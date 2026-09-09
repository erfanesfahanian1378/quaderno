/* eslint-disable no-undef */
/**
 * Quaderno's service worker. PHASE-13, rewritten in PHASE-17.
 *
 * Hand-rolled rather than Workbox: this is the whole caching story in one
 * file, against a build-tool dependency and a generated file nobody reads.
 *
 * Two things to understand before changing anything here.
 *
 * **pdf.js requests BYTE RANGES, not whole files.** A naive cache stores two
 * hundred partial 206 responses per document and can satisfy none of them,
 * because the next request asks for a different window. So a document is
 * cached as one complete body keyed by its documentId, and ranges are served
 * by slicing that body ourselves.
 *
 * **A Next page is HTML plus a graph of hashed JavaScript chunks.** Caching
 * the HTML alone gets you a page that loads and then throws ChunkLoadError.
 * Which chunks exist is only known after a build, so the build writes
 * /precache.json and install reads it.
 */

/*
 * v3 — PHASE-17: cache everything up front, not on second visit.
 *
 * v2 cached a page only *after* it had been visited online. That is fine for a
 * page you return to and useless for the case that actually matters — opening
 * the app with no signal and tapping something you have not tapped before,
 * which answered "you are offline" for a page the server had been perfectly
 * able to send an hour earlier.
 *
 * Three things changed. Install now caches every build asset from the
 * manifest, so no route can die on a missing chunk. A signed-in client asks
 * the worker to WARM every route it knows about, so the HTML is there before
 * it is wanted. And React's own navigation payloads are cached, so moving
 * between pages offline does not need a full reload to work.
 *
 * The version bump is load-bearing: activate deletes every cache whose name
 * does not carry the current version, which is how a fix reaches someone
 * already running the old worker.
 */
const VERSION = "v4";
const SHELL = `quaderno-shell-${VERSION}`;
const DOCS = `quaderno-docs-${VERSION}`;
const PAGES = `quaderno-pages-${VERSION}`;

/** ARCHITECTURE.md §5: 200 MB, LRU. */
const MAX_DOC_BYTES = 200 * 1024 * 1024;

/**
 * Cached pages are capped by COUNT, not bytes.
 *
 * `/library` varies by `?languageId=&folderId=`, so the key space is unbounded
 * — without a cap, a few minutes of clicking through folders fills the
 * origin's storage quota with HTML.
 */
const MAX_PAGES = 120;

/** When a page was stored, so the reader can be told how stale it is. */
const CACHED_AT = "x-quaderno-cached-at";

/**
 * Which pages are worth keeping: all of them.
 *
 * `/search` and `/settings` used to be excluded on the reasoning that a search
 * box which cannot search is worse than an honest "needs a connection". That
 * was wrong at the page level. A cached /search renders, shows the language
 * picker and recent items, and reports that searching needs a connection *in
 * the one control that needs one* — whereas excluding the page replaced the
 * entire app with an offline stub. Degrade the control, never the route.
 */
const CACHEABLE_PAGES = [
  "/dashboard",
  "/library",
  "/review",
  "/schedule",
  "/stats",
  "/search",
  "/settings",
  "/study",
  "/onboarding",
  "/d/",
];

/**
 * Routes warmed on a signed-in client's behalf, with no document ids: the
 * client appends those, because only it knows them.
 */
const WARM_ROUTES = [
  "/dashboard",
  "/library",
  "/review",
  "/schedule",
  "/stats",
  "/search",
  "/settings",
  "/study",
];

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

/** Written by the build. See scripts/precache-manifest.mjs. */
const MANIFEST = "/precache.json";

/** Where the manifest version last installed is remembered. */
const INSTALLED_VERSION = "/__precache-version__";

/**
 * Install holds only the fallback page. The build assets come later.
 *
 * `skipWaiting()` does not make a worker active — it only skips the wait for
 * the old one to be released. The worker still has to FINISH INSTALLING
 * first, so anything in this event's `waitUntil` delays taking control by
 * exactly that long. With the full manifest in here that was 136 requests and
 * 3.8 MB: a first visit went uncontrolled until the whole build had
 * downloaded, and on a slow connection the page could be closed before it
 * ever finished.
 *
 * So install keeps the two files the fallback needs, and the bulk moves to
 * activate, where it runs *after* clients are claimed.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precacheCritical());
});

/**
 * Cache every asset the build produced, plus the offline fallback.
 *
 * Not `cache.addAll`, which cannot filter: it stores whatever comes back,
 * redirects included, and one 404 rejects the whole call — so a single missing
 * asset would leave the worker with nothing. Each url is fetched on its own
 * and a failure costs only that url.
 *
 * The manifest is skipped when absent, which is the case in `next dev`: there
 * is no build output to enumerate, chunks are generated on demand, and the
 * runtime caching below covers what the reader actually touches.
 */
/** The offline fallback and its manifest. Two files, always worth waiting for. */
async function precacheCritical() {
  const cache = await caches.open(SHELL);

  await inBatches([FALLBACK, "/manifest.webmanifest"], 2, async (url) => {
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok || response.redirected) return;
      await cache.put(url, response);
    } catch {
      // Offline at install. The fallback is then unavailable until the next
      // visit, which is the same position as not having a worker at all.
    }
  });
}

async function precacheAssets() {
  const cache = await caches.open(SHELL);

  let manifest = null;
  try {
    const response = await fetch(MANIFEST, { cache: "no-cache" });
    if (response.ok) manifest = await response.json();
  } catch {
    // Offline at install, or a dev server. Neither is fatal.
  }

  /*
   * No manifest means no build output to enumerate — a dev server, or a
   * deploy where the generator did not run. Nothing to do: precacheCritical
   * has already stored the fallback, and everything else is cached as it is
   * used.
   */
  if (!manifest) return;

  const assets = manifest.assets;

  /*
   * Skip the whole download when nothing changed.
   *
   * Asset filenames are content-hashed, so an unchanged redeploy produces an
   * identical list. Re-fetching several megabytes because a container
   * restarted — over whatever connection the reader happens to be on — is a
   * cost with no benefit.
   */
  const installed = await cache.match(INSTALLED_VERSION);
  const known = installed ? await installed.text() : null;
  const wanted = manifest.version;

  if (known === wanted) return;

  /*
   * Bounded concurrency. `Promise.all` over ~200 chunk urls opens 200 sockets,
   * which on a phone is slower than six at a time and can have the browser
   * drop requests outright.
   */
  await inBatches(assets, 6, async (url) => {
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-cache",
      });
      if (!response.ok || response.redirected) return;
      await cache.put(url, response);
    } catch {
      // One asset short is a worse cache, not a broken install.
    }
  });

  await cache.put(INSTALLED_VERSION, new Response(wanted));

  /*
   * Prune what this build no longer references.
   *
   * Without it the shell cache grows by the size of a full build on every
   * deploy and is never reclaimed until the version constant changes.
   */
  const keep = new Set([...assets, INSTALLED_VERSION]);
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (!keep.has(path) && path.startsWith("/_next/static")) {
      await cache.delete(request);
    }
  }
}

/** Run `task` over `items`, at most `width` in flight. */
async function inBatches(items, width, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(width, queue.length) }, () =>
    (async () => {
      for (;;) {
        const item = queue.shift();
        if (item === undefined) return;
        await task(item);
      }
    })(),
  );
  await Promise.all(workers);
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      );

      // Claim BEFORE the download, so the page is controlled in milliseconds
      // rather than megabytes.
      await self.clients.claim();

      /*
       * Still inside `waitUntil`, which is what keeps the worker alive while
       * it runs — a fire-and-forget promise here would be killed the moment
       * the browser decided the worker was idle, leaving the cache half
       * filled with no way to notice.
       */
      await precacheAssets();
    })(),
  );
});

// ---------------------------------------------------------------------------
// Messages from the page
// ---------------------------------------------------------------------------

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

  if (data.type === "warm") {
    event.waitUntil(warm(data.pages ?? [], data.api ?? []));
  }

  /*
   * Sign-out.
   *
   * Cached pages are rendered HTML containing one person's library, schedule
   * and notes. Leaving them behind means the next person to sign in on this
   * device sees the previous one's dashboard until the network answers. The
   * documents cache goes too — those are their files.
   */
  if (data.type === "sign-out") {
    event.waitUntil(
      Promise.all([
        caches.delete(PAGES),
        caches.delete(DOCS),
        caches.open(SHELL).then(async (cache) => {
          // Build assets are impersonal and expensive to refetch; only the
          // API responses stored alongside them identify anyone.
          for (const request of await cache.keys()) {
            if (new URL(request.url).pathname.startsWith("/api/")) {
              await cache.delete(request);
            }
          }
        }),
      ]),
    );
  }
});

/**
 * Fetch and cache every route the client can name, before it is asked for.
 *
 * This is what turns "offline works for pages you already opened" into
 * "offline works". Each route is stored twice: as a document, for a cold
 * start or a reload, and as an RSC payload, for a link tapped inside the
 * running app. They are different responses to the same url and the router
 * needs the second one.
 *
 * Progress is reported per page so the UI can show real movement rather than
 * a spinner that means nothing.
 */
async function warm(extraPages, api) {
  const pages = [...new Set([...WARM_ROUTES, ...extraPages])];
  const total = pages.length + api.length;
  let done = 0;

  const announce = async (label) => {
    done += 1;
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: "warm-progress", done, total, label });
    }
  };

  await inBatches(pages, 4, async (path) => {
    try {
      const url = new URL(path, self.location.origin);

      const page = await fetch(url, {
        credentials: "include",
        headers: { "X-Quaderno-Warm": "1" },
      });
      await rememberPage(new Request(url.toString()), page);

      // The router's own payload. Requested exactly as Next requests it, so
      // what lands in the cache is what the router will later look for.
      const rsc = await fetch(url, {
        credentials: "include",
        headers: { RSC: "1", "X-Quaderno-Warm": "1" },
      });
      await rememberFlight(url, rsc);
    } catch {
      // A route that will not warm is a route that falls back to the network,
      // which is where it was already.
    }
    await announce(path);
  });

  await inBatches(api, 4, async (path) => {
    try {
      const response = await fetch(new URL(path, self.location.origin), {
        credentials: "include",
      });
      if (response.ok) {
        const cache = await caches.open(SHELL);
        await cache.put(path, stripVary(response));
      }
    } catch {
      // Same reasoning.
    }
    await announce(path);
  });

  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: "warm-done", total });
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

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

    // And the router's payload, so reaching it from the library offline does
    // not need a reload.
    const flight = await fetch(pageUrl, {
      credentials: "include",
      headers: { RSC: "1" },
    });
    await rememberFlight(pageUrl, flight);

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

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

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

  if (url.origin !== self.location.origin) return;

  /*
   * Immutable build output: cache-first.
   *
   * True of a PRODUCTION build, where every chunk filename carries a content
   * hash, and false of `next dev`, where chunks are named by route and
   * rewritten on every edit. This worker is never registered in development
   * for exactly that reason — see lib/offline/register.ts. If that ever
   * changes, this line is the bug.
   */
  if (url.pathname.startsWith("/_next/static")) {
    event.respondWith(cacheFirst(SHELL, request));
    return;
  }

  /*
   * The router's own navigation payloads.
   *
   * Checked BEFORE navigations, though the two cannot collide — an RSC fetch
   * has mode "cors", never "navigate" — because reading it in this order is
   * how the file explains itself.
   */
  if (isFlight(request, url)) {
    event.respondWith(handleFlight(request, url));
    return;
  }

  // Navigations: network-first, cache the result, fall back to that cache.
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  /*
   * Every API read, not only the viewer's.
   *
   * This was limited to `/api/documents/`, which meant the viewer worked
   * offline and nothing else did: the review queue, the schedule and the deck
   * lists all fetch on the client and all failed. Network-first with a cached
   * fallback gives a stale answer instead of no answer, and the outbox
   * reconciles writes on reconnect regardless.
   *
   * `/api/auth/` is excluded — a cached session response is a security
   * problem, not a convenience — and so is anything that is not a read.
   */
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/")) {
    event.respondWith(networkFirst(SHELL, request));
    return;
  }

  // Everything else under /public: icons, the pdf worker, fonts.
  if (!url.pathname.startsWith("/api/")) {
    event.respondWith(cacheFirst(SHELL, request));
  }
});

/**
 * Is this React asking for a route payload rather than a page?
 *
 * Next marks these two ways and sends both: the `RSC` header on the fetch, and
 * a `_rsc` cache-buster in the query string. Either is enough to recognise
 * one, and checking both means a change to one of them does not silently turn
 * every navigation payload into an uncached miss.
 */
function isFlight(request, url) {
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
}

/**
 * A synthetic key for a route payload.
 *
 * `_rsc` is a cache-buster derived from the build, so it must come out of the
 * key or a payload cached under one build id is unreachable under the next.
 * Prefetches are keyed apart because they are a DIFFERENT, partial response to
 * the same url — serving one where the router expected a full tree renders a
 * blank route.
 */
function flightKey(url, prefetch) {
  const clean = new URL(url.toString());
  clean.searchParams.delete("_rsc");
  const suffix = prefetch ? "?__prefetch=1" : "";
  return `/__flight__${clean.pathname}${clean.search}${suffix}`;
}

/**
 * A response is not cacheable while it carries `Vary`.
 *
 * Next varies RSC responses on `RSC` and `Next-Router-State-Tree`, and the
 * Cache API honours that: a payload stored against a real request matches only
 * a request with identical headers, and the state tree differs by wherever the
 * reader happened to navigate from. So it would store and never hit. Dropping
 * the header is what makes the entry reachable, and is safe because the key
 * already encodes everything we vary on ourselves.
 */
function stripVary(response) {
  const headers = new Headers(response.headers);
  headers.delete("Vary");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function rememberFlight(url, response) {
  if (!response.ok || response.redirected) return;

  const prefetch = response.headers.get("Next-Router-Prefetch") === "1";
  const cache = await caches.open(PAGES);
  await cache.put(flightKey(url, prefetch), stripVary(response.clone()));
}

/**
 * Network first, cached payload second, and a *failure* third — never the
 * offline page.
 *
 * This is the one place where returning the fallback would be actively
 * harmful. The router expects a flight payload; handed an HTML document it
 * throws inside the navigation and the reader gets a client-side exception on
 * a page that was working. A failed fetch, by contrast, is a case Next already
 * handles: it gives up on the soft navigation and does a full page load, which
 * lands on `handleNavigation` and the cached HTML.
 */
async function handleFlight(request, url) {
  const prefetch = request.headers.get("Next-Router-Prefetch") === "1";

  let response;
  try {
    response = await fetch(request);
  } catch {
    const cache = await caches.open(PAGES);
    const cached =
      (await cache.match(flightKey(url, prefetch))) ??
      (await cache.match(flightKey(url, false)));
    return cached ?? Response.error();
  }

  const copy = response.clone();
  rememberFlight(url, copy).catch(() => {});
  return response;
}

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // An asset that is neither cached nor reachable. The caller sees the
    // failure it would have seen without a worker.
    throw error;
  }
}

async function networkFirst(cacheName, request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, stripVary(response.clone()));
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreVary: true });
    return cached ?? Response.error();
  }
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
   * REDIRECT to the fallback rather than serving its HTML here.
   *
   * Next's client router compares the URL it is on with the payload it was
   * given. Handing the offline document back under /stats hydrates the wrong
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
  headers.delete("Vary");

  const stored = new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  const cache = await caches.open(PAGES);
  await cache.put(url.toString(), stored);
  await trimPages(cache);
}

async function servePageFromCache(request) {
  const cache = await caches.open(PAGES);

  // Exact url first — `/library?folderId=x` and `/library` are different
  // pages. `ignoreSearch` only as a fallback, so a viewer link carrying an
  // unfamiliar parameter still opens.
  const hit =
    (await cache.match(request.url, { ignoreVary: true })) ??
    (await cache.match(request, { ignoreSearch: true, ignoreVary: true }));

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
      return {
        key,
        at: Date.parse(response?.headers.get(CACHED_AT) ?? "") || 0,
      };
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
