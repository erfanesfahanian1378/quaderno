/* eslint-disable no-undef */
/**
 * The worker served at /sw.js in DEVELOPMENT. Its only job is to remove
 * itself.
 *
 * A service worker exists to serve stale content on purpose. In development
 * "stale" means "the code you just wrote is not running", and that failure is
 * genuinely hard to recognise: Next names its dev chunks by ROUTE
 * (`/_next/static/chunks/app/(app)/settings/page.js`, `webpack.js`) and
 * changes their contents on every edit, where a production build gives every
 * chunk a content hash. A worker holding those paths cache-first hands the
 * browser last hour's module table, and webpack fails on a module id that no
 * longer exists:
 *
 *     Cannot read properties of undefined (reading 'call')
 *
 * which names neither the cache nor the worker, and survives every edit made
 * to fix it — including editing the component the stack trace points at.
 *
 * So the dev server rewrites /sw.js to this file (see next.config.ts). Anyone
 * already carrying the real worker gets this one on their next navigation,
 * because browsers re-check the worker script then, and it clears the caches,
 * unregisters, and reloads the open tabs onto real code. No devtools, no
 * "clear site data", no knowing any of the above.
 */

self.addEventListener("install", () => {
  // Do not wait for the existing worker to be released. The whole point is to
  // replace it now.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      /*
       * Claim FIRST, and the order is the whole thing.
       *
       * `skipWaiting` makes this worker active; it does not take the pages
       * that are already open away from the old one. Until they are claimed,
       * their requests still run through the old worker's fetch handler — so
       * deleting the caches first simply hands it an empty cache to refill,
       * and the reload below is served stale all over again. Claiming puts
       * the pass-through handler at the bottom of this file in charge, and
       * only then is deleting worth anything.
       */
      await self.clients.claim();

      for (const key of await caches.keys()) await caches.delete(key);

      /*
       * The registration lingers in `getRegistrations()` until every client
       * using it goes away — that is the spec, not a failed unregister. What
       * matters is that no worker is left holding a cache.
       */
      await self.registration.unregister();

      /*
       * Reload whatever is open.
       *
       * Unregistering does not fix the page that is already running: it was
       * built from the stale chunks and is broken until something reloads it.
       * Doing it here is what makes this recovery automatic rather than
       * "and now reload twice".
       */
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.navigate(client.url);
      }
    })(),
  );
});

/*
 * Pass everything through, untouched, for the moments before activate lands.
 *
 * Without this the browser uses the previous worker's fetch handler, which is
 * the one serving stale chunks.
 */
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
