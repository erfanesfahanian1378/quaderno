# PHASE 16 — Offline, actually

**Goal:** the app works in a tunnel, on a plane, and in a classroom with no
signal — not just the one document you remembered to keep.

**Prerequisites:** Phases 01–15.

---

## What is true today

Measured on 2026-09-08 against a production build, not read off the code.

**Works:**

- A document explicitly kept offline opens with no network: three page
  canvases painted from cache, marks and note pages rendered.
- The service worker serves **byte ranges** out of the cached body, which is
  what pdf.js asks for.
- Annotations written offline queue in IndexedDB and sync on reconnect,
  idempotent on `(userId, clientId)`.

**Broken:**

- Every other route offline is `net::ERR_FAILED` — a dead tab, not a message.

Two compounding causes, both confirmed by inspecting the live cache:

```
'/dashboard': { status: 200, redirected: true, url: '/sign-in' }
'/library':   { status: 200, redirected: true, url: '/sign-in' }
'/':          { status: 200, redirected: false, url: '/' }
```

1. `SHELL_URLS` precaches `/dashboard` and `/library` at **install**, which
   happens before anyone signs in. `cache.addAll` follows the redirect and
   stores the **sign-in page** under those keys.
2. A browser refuses a **redirected** response for a navigation. So even the
   fallback path throws rather than falling back.

`/` survives because it is public.

**Why it shipped:** `tests/e2e/offline.spec.ts` is listed in PHASE-13's key
files and was never written. Nothing has ever driven this app offline in CI.
That is the single most important thing this phase changes.

---

## Scope

Three parts, each independently shippable and each worth having on its own.
Stop after any of them and the app is better than it was.

### Part 1 — Make the fallback work (½ day)

The bug above, and nothing else.

1. **Precache only public URLs at install**: `/`, `/offline`,
   `/manifest.webmanifest`. Authenticated routes are cached at runtime, after
   a real authenticated navigation, where the response is the page and not a
   redirect to sign-in.
2. **Never store a redirected response**: `if (response.redirected) return;`
   before every `cache.put` of a navigation. A response whose `url` is not the
   request's url is a redirect by another name.
3. **Rebuild before serving**: a cached navigation response is returned as a
   fresh `new Response(body, { status, statusText, headers })`. Even a
   correctly-cached response carries `redirected` through, and the browser
   rejects it at the navigation boundary. This is the line that turns
   `ERR_FAILED` into a page.
4. **A real `/offline` route**: a static page, precached, saying what is and is
   not available and listing the documents kept offline. Served for any
   navigation with nothing cached.
5. **Bump `VERSION` to `v2`.** Existing installs carry poisoned caches with the
   sign-in page under `/dashboard`, and the activate handler already deletes
   caches that do not match the current version. Without the bump, the fix
   reaches nobody who already used the app.

### Part 2 — The app reads from cache (1½ days)

Every page renders offline, showing the last version you saw, clearly labelled.

1. **Runtime-cache authenticated navigations.** Network-first with a cache
   fallback, which is the shape already there. On success, store the response
   plus an `X-Quaderno-Cached-At` header.
2. **Cap the page cache** at 50 entries, LRU by that timestamp. `/library` in
   particular varies by `?languageId=&folderId=`, so the key space is
   unbounded without a cap.
3. **Say when it is from.** A page served from cache is stale by definition and
   must never pretend otherwise. The client reads
   `caches.match(location.href)` and, if the served page came from cache,
   renders a strip: *"Offline — showing this page as it was at 14:32."*
   No service-worker messaging needed: the page can read its own cache entry.
4. **Which routes**, in priority order: `/library`, `/dashboard`, `/review`,
   `/schedule`, `/stats`. Not `/search` (a search with no network is a lie),
   not `/settings` (every control there needs the server).
5. **Disable what cannot work.** Offline, the upload dropzone, the share-link
   panel and the OCR button are disabled with a reason, not left to fail. The
   `useOnline` hook already exists.

### Part 3 — Writing offline, beyond annotations (3–4 days)

The outbox is real and tested, but it is **annotation-shaped**: hardcoded to
`/api/documents/:id/annotations/batch` and keyed by `documentId`. Generalising
it is the actual work of this part.

1. **A general outbox.** A second IndexedDB store next to the existing one:

   ```ts
   type QueuedWrite = {
     id: string;          // also the Idempotency-Key
     method: "POST" | "PATCH" | "PUT" | "DELETE";
     path: string;
     body: unknown;
     queuedAt: number;
     attempts: number;
     /** Writes to the same subject flush in order. */
     stream: string;      // e.g. "note-page:abc123"
   };
   ```

   Flushed oldest-first, one at a time within a stream, with the same
   exponential backoff and jitter the annotation queue already uses. The
   annotation queue stays as it is — it batches 50 ops into one request, which
   a general queue cannot, and rewriting a tested thing to share code with an
   untested one is the wrong trade.

2. **Idempotency is the hard part, and it is per endpoint.**

   | Write | Safe to replay? | What it needs |
   |---|---|---|
   | Note page `PUT` | Yes — last write wins | Nothing; already idempotent |
   | Comment `POST` | **No** — duplicates | `clientId`, unique per user |
   | Review grade `POST` | **No** — double-schedules the card | `Idempotency-Key`, stored |
   | Attendance confirm | Yes — already idempotent | Nothing |
   | Folder/rename/move | Yes — last write wins | Nothing |

   So: an `IdempotencyKey` table (`userId`, `key`, `responseJson`, `createdAt`,
   30-day sweep), and a `withIdempotency()` wrapper for the two endpoints that
   need it. Replaying a stored key returns the original response rather than
   acting again.

3. **Which writes to queue**, in value order — note pages first, because
   writing notes on a train is the whole point; then review grades, because
   reviewing on a train is the other whole point; then comments. Folder
   operations are explicitly **not** queued: reorganising a library with no
   network is not a thing anyone does, and every queued write is a conflict
   waiting to happen.

4. **Conflicts — the user decides.** Note pages already send
   `If-Unmodified-Since` and can return 409. A queued write that comes back
   409 is neither dropped nor forced through. Both versions are kept and the
   reader is shown the choice: **keep what I wrote here**, or **keep what is
   on the server**. Choosing the local copy re-sends it with the server's
   current timestamp so it lands; choosing the server's discards the queued
   write.

   Decided by the product owner rather than guessed: silently picking either
   side loses somebody's writing, and no heuristic can tell which side matters.
   Until the choice is made the queued write stays in the outbox and the
   pending count keeps showing it, so a conflict left unanswered is visible
   rather than forgotten.

5. **A visible queue.** One line in settings: *"3 changes waiting to sync"*,
   with what they are. A queue nobody can see is a queue nobody trusts.

---

## Out of scope

- **Offline upload.** An upload needs a presigned URL, which needs the
  network. Queue the *intent* and say so, or refuse — do not pretend.
- **Background Sync API.** Chromium-only, and the `online` listener already
  covers the case that matters.
- **Multi-device merge.** Two devices editing the same note page offline is a
  real conflict with no correct automatic answer. `ARCHITECTURE.md §1` rules
  out real-time collaboration and the local-first write path assumes a single
  writer; that assumption stays.
- **Offline search.** Postgres `pg_trgm` is doing the work. A client-side
  index over cached documents is a phase of its own.

---

## Key files

```
public/sw.js                              parts 1 and 2
src/app/offline/page.tsx                  the fallback page
src/lib/offline/{register.ts,useOnline.ts,cachedAt.ts}
src/components/offline/{OfflineProvider.tsx,StaleNotice.tsx}
src/lib/outbox/{writes.ts,db.ts}          part 3, the general queue
src/server/api/idempotency.ts             withIdempotency()
prisma/schema.prisma                      IdempotencyKey
src/components/settings/PendingWrites.tsx
tests/e2e/offline.spec.ts                 ← the one that was never written
tests/unit/outbox-writes.spec.ts
```

---

## Gotchas

- **A redirected response cannot be returned for a navigation.** This is the
  bug. `response.redirected` survives caching, and the browser rejects it at
  the navigation boundary with an opaque `ERR_FAILED`. Rebuild the response.
- **`cache.addAll` at install runs before sign-in.** Anything behind auth
  caches as the sign-in page. Cache authenticated routes at runtime only.
- **Dev and production behave differently.** In dev, Next serves CSS and
  chunks from URLs with changing `?v=` query strings, so nothing cache-first
  ever hits and offline looks far worse than it is. **Test offline against
  `next build && next start`,** never against `next dev`.
- **Secure context.** Service workers, and therefore all of this, need HTTPS
  or localhost. A phone on `http://192.168.x.x` registers no worker. Same rule
  as `crypto.randomUUID`, `getUserMedia` and Web Push.
- **`caches` has no size API.** Track sizes alongside the outbox, as the
  document cache already does.
- **`navigator.onLine` lies.** It reports the link, not reachability — a
  captive portal is "online". Treat a failed fetch as the real signal; the
  existing `useOnline` hook should be corrected to agree.

---

## Acceptance criteria

**Part 1**

- [ ] Offline, `/dashboard`, `/library` and `/review` render a page — either
      the cached one or `/offline` — and never `ERR_FAILED`.
- [ ] No cache entry is ever a redirected response. Asserted in the e2e test
      by reading the cache, not by trusting the code.
- [ ] An install carrying `v1` caches upgrades cleanly and drops them.

**Part 2**

- [ ] Every cached page carries a visible "as it was at HH:MM" strip when it
      is served from cache, and does not show it when it is not.
- [ ] The page cache stays at 50 entries after visiting 80 distinct library
      URLs, evicting least-recently-used.
- [ ] Offline, upload, sharing and OCR are disabled with a stated reason
      rather than failing on click.

**Part 3**

- [ ] A note page edited offline, with the tab reloaded while still offline,
      syncs on reconnect with the edit intact.
- [ ] Twenty review grades made offline apply exactly once — asserted by card
      count and `ReviewLog` rows, replaying the queue twice.
- [ ] A comment written offline appears once, not twice, after two flushes.
- [ ] A note page changed on another device while offline produces a visible
      conflict, and neither version is lost.
- [ ] Settings shows the pending count and it reaches zero after reconnect.

**All parts**

- [ ] `tests/e2e/offline.spec.ts` drives a real browser through
      `context.setOffline(true)` against a **production build**, and covers
      every criterion above. This test is the deliverable; the rest is the
      thing it protects.

---

## Sequencing

| | Effort | Ship on its own? |
|---|---|---|
| Part 1 | ½ day | Yes — turns a dead tab into a working page |
| Part 2 | 1½ days | Yes — the app becomes readable offline |
| Part 3 | 3–4 days | Yes, per write kind: note pages, then grades, then comments |

Part 1 is worth doing regardless of whether 2 and 3 ever happen. Part 3 can be
taken one write at a time, and each one is independently useful.

---

## Built — 2026-09-08

All three parts. Two things the plan did not anticipate, both found by running
the suite rather than by reading:

**The Next `/offline` route could not work.** It loaded and then threw
`ChunkLoadError`: its JavaScript bundle had never been cached, because the
reader had never visited `/offline` while online. A fallback that depends on
the framework's chunk graph fails at exactly the moment it exists for. It is
`public/offline.html` now — no build step, no chunks, no stylesheet, inline
everything. It still lists what is available by reading Cache Storage directly.

**Serving the fallback's HTML under another URL breaks hydration.** Next's
router compares the URL it is on with the payload it was handed, so returning
the offline document for `/stats` produced "a client-side exception has
occurred" — a worse failure than the one being handled. The worker issues a
302 instead. A redirect the worker *creates* is fine; it is a cached response
that already *followed* one that navigations refuse.

And one correction to the plan's own diagnosis: `/` also had to be dropped from
the precache. It redirects to `/dashboard` for a signed-in visitor, so
`cache.addAll` stored a redirected response for it too — the same fault as
`/dashboard`, one url along. The install now fetches each url individually and
keeps only what is not a redirect.

**A trap worth writing down for whoever tests this next:** `next start` runs
with `NODE_ENV=production`, where the session cookie is named
`__Secure-authjs.session-token`. Setting the development name against a
production build is not an error and not a test failure — every request simply
runs signed out, and the suite passes while asserting nothing. That happened
here, and the e2e setup now mints a real session so it cannot happen again.
