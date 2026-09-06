# PHASE 05 — Document viewer

**Goal:** open a document and read it — fast, on a phone, offline. No
annotation yet; this phase builds the surface the annotation layer sits on, and
the performance decisions made here determine whether Phase 06 feels good or
terrible.

**Prerequisites:** Phases 01–04. Read `ANNOTATION_ENGINE.md §1, §2, §9`.

## Scope

1. **pdf.js integration** — worker-based, `disableAutoFetch: true`,
   `rangeChunkSize: 65536`, document loaded from a signed URL via
   `GET /api/documents/:id/source-url`, refreshed before its 5-minute expiry.
2. **The page component** — the exact three-layer stack from
   `ANNOTATION_ENGINE.md §1`. Layer 3 (the annotation SVG) is created **now**,
   empty, with the `viewBox="0 0 1 1"` contract established, so Phase 06 only
   has to fill it.
3. **`coords.ts`** — `toNormalised` / `toDevice`, handling CropBox, page
   rotation and devicePixelRatio. Unit-tested against a fixture PDF with a
   rotated page and a non-origin CropBox. **This file is the only place
   coordinate maths may live.**
4. **Virtualised scrolling** — a render window (3 mobile / 5 desktop), one
   shared `IntersectionObserver`, correctly-sized placeholders so the scrollbar
   never jumps, canvas release outside the window.
5. **Zoom & fit** — fit-width (default), fit-page, 50–400% in steps, pinch-zoom
   on touch, ⌘/Ctrl +/− and ⌘0 on desktop. Zoom changes container size only;
   annotations must need no recomputation (verify with a placeholder rect).
6. **Navigation** — thumbnail rail (desktop, collapsible), page-number pill on
   scroll, jump-to-page, keyboard `j/k`, `PageUp/Down`, `Home/End`.
7. **Chrome behaviour** — desktop header with title, breadcrumb, sync state and
   overflow; mobile chrome auto-hides on scroll down, returns on scroll up or
   tap.
8. **PWA** — manifest, icons, service worker (Workbox or hand-rolled):
   precache the shell, runtime-cache normalised PDFs for documents opened in
   the last 7 days, LRU capped at 200 MB. Install prompt handled tastefully.
9. **Offline** — an offline banner, cached documents openable with no network,
   an honest "not downloaded" state for the ones that are not.
10. **`POST /api/documents/:id/opened`** beacon on open.
11. **States** — loading skeletons at the correct aspect ratio, `CONVERTING`
    (poll SSE and swap in when ready), `FAILED`, no-text-layer hint with the
    OCR offer, and the dark-mode page inversion toggle.

## Out of scope

Anything that writes an annotation. Note pages. Export.

## Key files

```
src/components/viewer/{Viewer.tsx,Page.tsx,TextLayer.tsx,AnnotationLayer.tsx,
  coords.ts,usePdfDocument.ts,useRenderWindow.ts,ThumbnailRail.tsx,
  ViewerHeader.tsx,ZoomControls.tsx}
src/workers/pdf.worker.ts
src/app/(app)/d/[documentId]/page.tsx
public/manifest.webmanifest  src/app/sw.ts
tests/perf/viewer.spec.ts
```

## Acceptance criteria

- [ ] A 200-page PDF opens with page 1 painted in **under 1.5 s on a throttled
      4G + 4× CPU profile**, and the initial network transfer is under 400 KB.
- [ ] Scrolling that 200-page document drops fewer than 20 frames over a 10 s
      trace at 4× CPU throttle — `tests/perf/viewer.spec.ts`, failing the
      build.
- [ ] Memory does not grow monotonically while scrolling to the end and back:
      heap after the round trip is within 20% of the start.
- [ ] A placeholder rect drawn at normalised `(0.5, 0.5)` stays centred at 50%,
      100%, 400% zoom, on a rotated page, and on a page with a non-origin
      CropBox.
- [ ] Airplane mode: a previously opened document still opens and scrolls.
- [ ] Pinch-zoom on a real phone is smooth and does not fight page scroll.
- [ ] Lighthouse PWA installable, performance ≥90 on the viewer route.
