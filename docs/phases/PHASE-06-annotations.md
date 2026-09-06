# PHASE 06 — Annotation engine

**Goal:** the reason the app exists. Highlight, draw, type on, and comment on
any page, on any device, online or off, with nothing ever lost.

**Prerequisites:** Phases 01–05. **Read `ANNOTATION_ENGINE.md` in full first.**

## Scope

1. **Server side**
   - `AnnotationRepository`, `CommentRepository` (scoped, per the base).
   - Zod geometry schemas, one per `AnnotationKind`, rejecting any coordinate
     outside `[0,1]`.
   - `GET /api/documents/:id/annotations?since=` delta sync with tombstones.
   - `POST /api/documents/:id/annotations/batch` — idempotent upsert on
     `(userId, clientId)`, ≤50 ops, per-op results, one bad op never fails the
     batch.
   - Comment endpoints, one-level threading, resolve/unresolve.
2. **Client store** — normalised `Map<leafId, Annotation[]>`, fetched once per
   document, updated optimistically. Zustand or a reducer + context; no
   per-page fetching.
3. **Local-first write path** — the five steps in `ANNOTATION_ENGINE.md §7`:
   `clientId`, optimistic apply, IndexedDB outbox, 400 ms debounced batch POST,
   backoff on failure. Outbox survives a reload.
4. **Text-anchored marks** — selection capture, rect merging by baseline,
   quad normalisation, and the `{prefix, exact, suffix, offsets}` anchor.
   Highlight, underline, strikethrough.
5. **Rectangle-highlight fallback** for pages with no text layer, plus the
   inline hint offering OCR.
6. **Ink** — Pointer Events, `setPointerCapture`, `getCoalescedEvents`,
   pressure, palm rejection, direct-DOM live stroke (no React state during a
   stroke), RDP simplification at `ε = 0.0008`, Catmull-Rom smoothing, one
   annotation per stroke. Three widths, four colours.
7. **Eraser** — stroke eraser only. Pixel eraser is explicitly deferred.
8. **Text boxes** — inline `contentEditable`, normalised font size, auto-grow,
   drag to move, resize.
9. **Shapes** — rect, ellipse, line, arrow; drag to draw, resize handles,
   Shift to constrain.
10. **Comments** — comment pins, threads on highlights, the right rail
    (desktop) and bottom sheet (mobile), resolve, click-to-scroll with a pulse
    on the mark.
11. **Annotations list view** — every highlight with its quoted text, filtered
    by colour label. This is the revision surface; it matters.
12. **Highlighter labels** — the five colours are user-renameable in settings
    and their labels appear in the picker, the list and the export.
13. **Toolbar & selection popover** — exactly as in design brief §5.7,
    including the mobile thumb-reachable placement.
14. **Undo/redo** — client command stack, 50 deep, scoped to the document,
    `⌘Z` / `⌘⇧Z`.
15. **Sync indicator** — synced / _n_ pending / offline, per document.

## Out of scope

Note pages (Phase 07). Export (Phase 07). Real-time collaboration (not on the
roadmap).

## Key files

```
src/server/repositories/{annotation.ts,comment.ts}
src/server/services/annotations/{index.ts,geometry.ts,anchor.ts,sync.ts}
src/server/validation/annotation.ts
src/app/api/documents/[documentId]/annotations/{route.ts,batch/route.ts}
src/app/api/documents/[documentId]/comments/route.ts
src/components/viewer/annotations/{AnnotationLayer.tsx,HighlightMark.tsx,
  InkMark.tsx,TextBoxMark.tsx,ShapeMark.tsx,CommentPin.tsx,
  SelectionPopover.tsx,Toolbar.tsx,ColorPicker.tsx}
src/components/viewer/ink/{useInkCapture.ts,simplify.ts,smooth.ts}
src/components/viewer/comments/{CommentsPanel.tsx,CommentThread.tsx}
src/lib/outbox/{db.ts,queue.ts,useOutbox.ts}
src/lib/undo/stack.ts
```

## Acceptance criteria

- [ ] Highlight a phrase spanning three pdf.js text runs → one visual bar, not
      three.
- [ ] Reload after highlighting: the mark is in the same place at 50%, 100% and
      400% zoom, and on a phone.
- [ ] Go offline, create 30 mixed annotations, reload the page while still
      offline (they are still there), go online → all 30 sync, none duplicated.
- [ ] Kill the network mid-batch, let it retry after the server already
      committed: **no duplicates** — proven by a test that replays an
      identical batch twice and asserts the row count.
- [ ] Ink input-to-paint latency under 16 ms on a mid-range device; a 3-second
      scribble stores fewer than 120 points.
- [ ] Palm rejection: a touch contact while a pen is active draws nothing.
- [ ] Undo/redo across 20 mixed operations restores exact state.
- [ ] Highlight colours pass 3:1 contrast on white and on the inverted
      dark-mode page — an automated contrast test over the token values.
- [ ] Every tool is reachable and usable by keyboard alone; highlights are
      enumerable by a screen reader with their quoted text.
- [ ] Tenancy: another user's document id returns 404 from every annotation
      endpoint.
