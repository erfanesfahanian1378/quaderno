# PHASE 14 — Export, completely

**Goal:** two gaps in an otherwise working export. Flattened and notes-only
work in the browser today; **layered** is not offered, and documents over 150
leaves have nowhere to go.

**Prerequisites:** Phases 01–09. `src/lib/export/bake.ts` and the
`GET /api/documents/:id/export` handover are done.

## Scope

### 1. Layered export — real, editable PDF annotations

The flavour is currently not offered at all, because offering a flattened
file under that name would be a lie. Implement it properly.

`pdf-lib` has no high-level API for annotation objects, so they have to be
built from its primitives (`PDFDict`, `PDFArray`, `PDFName`, `context.obj`)
and pushed onto each page's `/Annots`:

| Kind | Subtype | Key geometry |
|---|---|---|
| Highlight | `/Highlight` | `/QuadPoints` — 8 numbers per quad, **PDF user space, y-up** |
| Underline / Strike | `/Underline` `/StrikeOut` | same QuadPoints |
| Ink | `/Ink` | `/InkList` — an array of arrays of x y pairs |
| Text box | `/FreeText` | `/Rect`, `/DA` (e.g. `0 0 0 rg /Helv 12 Tf`), `/Contents` |
| Pin | `/Text` | `/Rect`, `/Contents`, `/Name /Comment` |

Every one needs `/Type /Annot`, `/Rect`, `/F 4` (print), `/C` (colour as an
array of 0–1 components) and `/CA` (opacity).

**The y-flip is the whole difficulty.** Stored geometry is normalised and
y-down; PDF user space is y-up and CropBox-relative.
`normalisedToPdfPoint()` in `src/components/viewer/coords.ts` already does
exactly this conversion and is unit-tested — use it, do not re-derive it.

### 2. Server-side export past 150 leaves

- `document.export` job in the worker, reusing `src/lib/export/bake.ts`
  unchanged. It is plain pdf-lib and already runs in Node.
- Writes to `exportKey(userId, exportId)`, sets `Export.status` and
  `storageKey`.
- `GET /api/exports/:id` returns `{ status, downloadUrl? }` with a signed URL.
- The `Export` model already exists in the schema.
- The endpoint already returns `{ mode: "server" }` past the limit; wire the
  job behind it.

### 3. Print stylesheet

`⌘P` on a document should produce something sane: pages at their real size,
one per sheet, no app chrome, annotations included.

## Out of scope

Comment appendix pages beyond a simple list. Exporting a whole language.

## Key files

```
src/lib/export/layered.ts            annotation dictionary construction
worker/jobs/document-export.ts
src/app/api/exports/[exportId]/route.ts
src/styles/print.css
tests/unit/export/layered.spec.ts
tests/e2e/export.spec.ts
```

## Gotchas

- **The typesetter exists twice** (`worker/lib/typeset.ts` and
  `src/lib/export/typeset-client.ts`) and both files say so. The server job
  uses the worker copy. Do not "fix" the duplication by importing across the
  boundary — it pulls worker-only modules into the client bundle.
- Colour tokens are resolved **in the browser** for client exports, because
  `hl-yellow` means different things in light and dark. A server export has no
  theme: resolve to the **light** values and say so, or the exported colours
  will not match what the user sees.
- Acrobat is stricter than Preview. A `/FreeText` without `/DA` renders blank
  in Acrobat and fine in Preview, so test in both.

## Acceptance criteria

- [ ] Layered export: highlights and ink open as **real, editable annotation
      objects** in Acrobat and in Preview — selectable, movable, deletable.
- [ ] A layered highlight's quads land on exactly the same words as the
      flattened export of the same document.
- [ ] `à è é ì ò ù ç œ â ê î ô û ë ï ü` render in an exported note page, in
      both flavours.
- [ ] A 200-leaf document exports server-side, notifies, and downloads.
- [ ] A 30-page document with 100 mixed annotations still exports in the
      browser in under 8 s.
- [ ] `⌘P` produces a printable document with annotations and no app chrome.
