# Annotation Engine

This is the hardest and most differentiating part of Quaderno. Read this in
full before writing any code under `src/components/viewer/**` or
`src/server/services/annotations/**`.

**Scope, from the product requirement:** highlight, add comments, add more
notes, insert pages between notes, add detail, write freehand on the page —
on PDFs _and_ on Word files (which become PDFs at ingest, see
`ARCHITECTURE.md §3`). Every capability must work on both, because after
ingest there is no "docx path" left.

---

## 1. The layer stack

Each visible page is three stacked, exactly-aligned layers inside one
positioned container:

```
┌─ .page  (position: relative; width/height from the PDF page @ scale) ──┐
│                                                                        │
│  1. <canvas>          pdf.js render — the page pixels                  │
│  2. .text-layer       transparent positioned <span>s from pdf.js       │
│                       getTextContent(); this is what makes text        │
│                       selectable and highlightable                     │
│  3. <svg .annots>     all annotations, in normalised viewBox "0 0 1 1" │
│                       with preserveAspectRatio="none"                  │
└────────────────────────────────────────────────────────────────────────┘
```

The SVG trick is the whole reason coordinates are normalised: a viewBox of
`0 0 1 1` means an annotation stored at `x = 0.5` sits at the horizontal
centre at every zoom level, on every screen, with **zero recomputation on
resize**. Zoom changes exactly one thing — the container's pixel size.

Ink strokes and shapes are SVG children. Text boxes are HTML overlaid on the
SVG (SVG text wrapping is not worth the pain), positioned with percentage
`left/top/width` so they inherit the same behaviour.

---

## 2. Coordinate contract

> `x, y ∈ [0,1]`, origin **top-left**, relative to the page's **un-rotated
> CropBox** (not MediaBox, not the rotated viewport).

Two helpers, and nothing else may convert coordinates:

```ts
// src/components/viewer/coords.ts
export function toNormalised(pt: DevicePoint, page: PageGeometry): NormPoint;
export function toDevice(pt: NormPoint, page: PageGeometry): DevicePoint;
```

`PageGeometry` carries `{ cropBox, rotation, scale, devicePixelRatio }`.
Handle `Leaf.rotation` **only in `toDevice`** — stored geometry is always in
rotation-0 space, so rotating a page for viewing never rewrites annotations.

Common bug to avoid: pdf.js viewports are y-up in PDF user space and y-down in
CSS space. Convert once, at the boundary, in these two functions. Anywhere
else in the codebase, y grows downward.

---

## 3. Text-anchored marks (highlight / underline / strikethrough)

### Capturing

1. On `selectionchange` (debounced 120 ms) inside the text layer, take the
   DOM `Range`.
2. `range.getClientRects()` → merge rects that share a baseline (pdf.js emits
   one span per text run; a highlight across three runs must not look like
   three separate bars).
3. Normalise each merged rect → `geometry.quads`.
4. Capture the **text anchor** at the same time:

```ts
{
  pageIndex: 4,
  exact:  "il passato prossimo",
  prefix: "…quando si usa ",   // up to 32 chars before
  suffix: " rispetto all'imp…", // up to 32 chars after
  startOffset: 1284,            // offset in the page's normalised text
  endOffset: 1303
}
```

Quads are what get _drawn_. The anchor is what lets a mark survive
re-conversion — if the user re-uploads a corrected .docx and the PDF reflows,
a background job re-locates each highlight by searching `prefix + exact +
suffix` in the new page text and rewrites its quads. Marks that cannot be
re-located are flagged `orphaned` in the UI rather than deleted.

### Scanned pages with no text layer

`SourceFile.hasTextLayer = false` means selection is impossible. Two responses,
both required:

- Offer OCR (`ocrmypdf --skip-text`, queued job). After OCR, a real text layer
  exists and highlighting works normally.
- Until then, the highlight tool falls back to **rectangle highlight** —
  drag a box, store it as a single quad with `quotedText = null`. The user is
  told once, in a dismissible inline hint, not a modal.

---

## 4. Freehand ink

Pointer Events only (`pointerdown/move/up`), never mouse or touch events —
this is what gets pen pressure and palm rejection on an iPad for free.

```ts
element.setPointerCapture(e.pointerId);
if (e.pointerType === "touch" && tool === "pen" && palmRejection) return;
const pressure = e.pressure > 0 ? e.pressure : 0.5; // mice report 0
```

- Collect raw points; render the live stroke into a **separate throwaway
  `<path>`** on every `pointermove` using `getCoalescedEvents()` for full
  input resolution. Do not touch React state during a stroke — a
  `useRef` + direct DOM write. Target: input-to-ink latency < 16 ms.
- On `pointerup`: simplify with Ramer–Douglas–Peucker (`ε = 0.0008` in
  normalised units — about 0.6 px on an A4 page at 100%), then smooth with a
  Catmull-Rom → cubic Bézier conversion. A 3-second scribble goes from ~600
  points to ~60 without visible change.
- Persist as one `INK` annotation per stroke, not per gesture group. Undo then
  removes one stroke, which is what people expect from a pen.
- Cap: 2,000 points per stroke before an automatic split, to bound payload
  size.

**Eraser** has two modes and the UI must let the user pick: _stroke eraser_
(delete whole intersecting `INK` annotations — cheap, predictable) and _pixel
eraser_ (split a stroke's point array at the intersection, writing two
annotations and deleting the original). Ship stroke eraser in PHASE-06; pixel
eraser is explicitly deferred.

---

## 5. Text boxes, shapes, and comment pins

- **`TEXT_BOX`** — click places a box, type inline with a `contentEditable`
  div. `fontSize` is stored normalised (fraction of page height) so text
  scales with zoom instead of drifting. Auto-grow height; store the final
  `h` so other clients lay it out identically without re-measuring fonts.
- **`SHAPE`** — rect, ellipse, line, arrow. Drag to draw, 8 resize handles,
  Shift constrains to square/circle/45°.
- **`COMMENT_PIN`** — a marker with no visual mark of its own; carries a
  `Comment` thread. A highlight can also carry a thread (`Comment.annotationId`
  points at the highlight), which is the common case: highlight a phrase, ask
  yourself a question about it, answer it later.

Comments are threaded one level deep (`parentId`) and resolvable. The comments
panel is a right rail on desktop and a bottom sheet on mobile; clicking a
thread scrolls its page into view and pulses the mark.

---

## 6. Inserted note pages

This is the "add page between notes" requirement, and it lives half in this
engine and half in the composition service.

- **Insert** at any position: `POST /api/documents/:id/leaves` with
  `{ kind: "NOTE_PAGE", afterLeafId }`. The service computes
  `position = (prev + next) / 2`, creates a `NotePage`, returns the leaf.
- The note page renders as a **real page in the same scroll flow**, same
  width, same shadow, same page number — not a modal, not a sidebar. Scrolling
  from handout page 3 into your own page and back must feel like one document.
- A note page is markdown, edited in place. It supports the same annotation
  layer as any other page (you can highlight your own notes), because the
  annotation layer is bound to `Leaf`, not to the page's origin.
- **Templates** on insert: Blank, Lined, Grid, Cornell, Vocabulary table
  (word / translation / example / note), Verb conjugation table. The last two
  are the language-learning payoff and should be in the first release.

---

## 7. Local-first write path

Every mutation follows the same five steps. Deviating from this is the fastest
way to make the app feel broken on a slow connection.

```
1. Generate clientId = crypto.randomUUID()
2. Apply to the in-memory store immediately  → the mark appears instantly
3. Append to the IndexedDB outbox            → survives a reload/crash
4. POST (batched, 400 ms debounce, ≤50 ops)  → server upserts on (userId, clientId)
5. On 2xx: drop from outbox, reconcile ids. On network failure: keep it,
   retry with exponential backoff + jitter, cap 5 min.
```

The batch endpoint takes a mixed array of operations:

```jsonc
POST /api/documents/:id/annotations/batch
{ "ops": [
  { "op": "create", "clientId": "…", "kind": "HIGHLIGHT", "leafId": "…", … },
  { "op": "update", "clientId": "…", "geometry": { … } },
  { "op": "delete", "clientId": "…" }
] }
```

It is idempotent by construction, so a retry after a timeout that actually
succeeded is harmless. Return per-op results; a single bad op must not fail
the batch.

**Undo/redo** is a client-side command stack over these same operations,
50 entries deep, scoped to the open document, cleared on close. Undo of a
create issues a delete with the same `clientId`.

---

## 8. Export: baking annotations into a PDF

Export runs **in the browser** by default (`pdf-lib` in a web worker), because
that is worth ~2 GB-seconds of server CPU per export on a box that has none to
spare.

```
for each visible leaf, in position order:
  SOURCE_PAGE → copyPages() from the source PDF
  NOTE_PAGE   → render markdown to a new page (see below)
  then draw its annotations onto the page:
    HIGHLIGHT      → rects, multiply blend, alpha from opacity
    UNDERLINE/STRIKE → lines at the quad's baseline / mid-height
    INK            → bezier paths at stored width
    SHAPE          → primitives
    TEXT_BOX       → embedded font, wrapped to the stored box
    COMMENT_PIN    → a numbered marker + an appendix page listing threads
```

Three export flavours, all offered in the UI:

| Flavour        | Contents                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------- |
| **Flattened**  | annotations painted into the page content — universally viewable, not re-editable             |
| **Layered**    | real PDF annotation objects (`/Highlight`, `/Ink`, `/FreeText`) — editable in Acrobat/Preview |
| **Notes only** | just the `NOTE_PAGE` leaves plus a comment appendix — the revision handout                    |

Note-page rendering for export: markdown → a constrained subset (headings,
paragraphs, lists, tables, code, bold/italic) laid out by a small typesetter
over `pdf-lib`. **Do not** pull in a headless browser for this. Embed one
serif and one sans subset with full Latin-1 + Latin Extended-A coverage — the
app is for Italian and French, so `à è é ì ò ù ç œ â ê î ô û ë ï ü` must
render, and a font that drops them is a shipping blocker.

Documents over 150 leaves fall back to a queued server-side export, which
notifies the user when the file is ready.

---

## 9. Performance rules for the viewer

- Render window of `RENDER_WINDOW` pages; release canvases outside it and keep
  a correctly-sized placeholder so the scrollbar never jumps.
- One `IntersectionObserver` for the whole document, not one per page.
- pdf.js runs in its worker; never call `getDocument` on the main thread.
- Ink drawing bypasses React entirely during a stroke.
- Annotations for a document are fetched once and held in a normalised store
  (`Map<leafId, Annotation[]>`); per-page fetching causes a request storm on
  fast scroll.
- Memoise the SVG for a page on `(annotations version, leafId)`. Panning must
  not re-render annotation subtrees.
- Budget: **60 fps scroll on a 4-year-old mid-range Android** over a 40-page
  document. This is a test, not a hope — `tests/perf/viewer.spec.ts` traces it
  with CPU throttling 4× and fails the build over 20 dropped frames.

---

## 10. Accessibility

- Every annotation tool reachable by keyboard; the toolbar is a roving-tabindex
  toolbar with `aria-pressed` on the active tool.
- Highlights are real elements with `role="mark"` and an accessible name
  including the quoted text, so a screen reader can enumerate them.
- The comments panel is the keyboard-accessible route to every annotation —
  a user who cannot draw can still read, navigate and comment.
- Highlight colours pass 3:1 contrast against page white _and_ against the
  inverted dark-mode page; never encode meaning in colour alone (each colour
  gets a user-editable label, e.g. "yellow = grammar").
