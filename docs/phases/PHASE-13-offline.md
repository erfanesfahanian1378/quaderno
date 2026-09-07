# PHASE 13 — Offline & installable

**Goal:** the app survives a metro tunnel between two classes. Writing
already does — the IndexedDB outbox is built and tested. **Reading does
not**: with no network the viewer cannot fetch its signed URL and shows an
error.

**Prerequisites:** Phases 01–09.

## Scope

1. **Manifest and icons.** `public/manifest.webmanifest`, maskable icons at
   192/512, `theme_color` from the token set, `display: standalone`.
2. **Service worker** (Workbox or hand-rolled — hand-rolled is ~120 lines and
   avoids a build-tool dependency):
   - precache the app shell,
   - runtime-cache the **normalised PDF** for any document opened in the last
     7 days, capped at **200 MB, LRU** (`ARCHITECTURE.md §5`),
   - network-first for API reads, cache-first for immutable assets.
3. **The signed-URL problem.** A cached PDF must be servable when the signed
   URL has expired and cannot be refreshed. Cache the *response body* keyed by
   `documentId`, not by the signed URL — the URL changes every five minutes
   and would never hit.
4. **Offline UI**: a banner strip, and an honest per-document state in the
   library — "downloaded" vs "not downloaded". Never let a user tap into a
   document offline and find nothing.
5. **Explicit "keep offline"** toggle per document, so a user leaving for a
   lesson can guarantee what they will have.
6. **Install prompt**, handled tastefully: capture `beforeinstallprompt`,
   offer it once from settings, never as a modal on load.
7. **The outbox already works** — verify it end to end here rather than
   rebuild it: 30 annotations created offline, a reload while still offline,
   then reconnect and confirm none are duplicated.

## Out of scope

Background sync API. Push notifications. Offline upload (an upload needs the
presigned URL, which needs the network; queue it and say so).

## Key files

```
public/manifest.webmanifest  public/icons/**
src/app/sw.ts                        the worker itself
src/lib/offline/{register.ts,cache.ts,useOnline.ts}
src/components/library/OfflineToggle.tsx
src/components/viewer/OfflineBanner.tsx
tests/e2e/offline.spec.ts
```

## Gotchas

- **`localhost` is a secure context; a LAN IP is not.** Service workers
  require a secure context, so a phone on `http://192.168.x.x` will not
  register one. Test offline behaviour over HTTPS or through a tunnel, and do
  not conclude the worker is broken because it does not appear on the LAN
  address. This is the same rule that broke `crypto.randomUUID` earlier.
- pdf.js requests **byte ranges**, not whole files. A naive cache stores 200
  partial responses per document and satisfies none of them. Either fetch and
  cache the whole PDF on "keep offline", or make the worker serve ranges from
  a cached full body.
- The 200 MB cap needs real eviction. `caches` has no size API, so track
  sizes in IndexedDB alongside the outbox.

## Acceptance criteria

- [ ] Airplane mode: a previously opened document still opens and scrolls.
- [ ] A document never opened offline says so honestly rather than spinning.
- [ ] 30 mixed annotations created offline survive a reload while still
      offline, then sync on reconnect with **no duplicates** — the batch is
      idempotent on `(userId, clientId)`, so this is a verification, not new
      work.
- [ ] The cache stays under 200 MB across 30 opened documents, evicting the
      least recently used.
- [ ] Lighthouse: installable, and performance ≥90 on the viewer route.
- [ ] Turning the network off mid-scroll does not blank pages already
      rendered.
