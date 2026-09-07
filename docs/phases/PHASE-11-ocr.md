# PHASE 11 — Scanned handouts: OCR

**Goal:** make a photograph of the whiteboard as useful as a PDF. Today a
scan opens, renders and can be drawn on, but has no text layer, so it cannot
be selected, highlighted by text, or searched.

**Prerequisites:** Phases 01–09. `ocrmypdf`, `tesseract-ocr` and the Italian,
French, German and Spanish language packs are **already in the worker image**;
the queue name `document.ocr` already exists. Nothing consumes it.

## Scope

1. **`document.ocr` worker job.**
   ```
   ocrmypdf --skip-text --rotate-pages --deskew --optimize 1 \
            --language <codes> in.pdf out.pdf
   ```
   `--skip-text` is not optional: it leaves pages that already have text
   alone, which is what makes the job safe to run on a mixed document and
   safe to re-run.
2. **Language selection** from the document's `Language.code`, mapped to
   Tesseract's three-letter codes (`it` → `ita`, `fr` → `fra`). Fall back to
   `eng` and say so. Pass multiple codes when the document is bilingual.
3. **Never mutate.** The OCR'd PDF is a **new storage key**, not an overwrite
   (`CLAUDE.md` rule 8). Update `SourceFile.pdfStorageKey`, set
   `ocrApplied = true` and `hasTextLayer = true` in one transaction.
4. **Page count must not change.** Assert it before swapping the key. If
   `ocrmypdf` returns a different count, fail the job and keep the original —
   every `Leaf.sourcePageIndex` and every annotation quad depends on the page
   geometry being identical.
5. **Offered, never automatic** (`PHASE-04 §7`). The inline hint in the viewer
   already exists for `hasTextLayer = false`; wire its action.
6. **Progress.** A chip in the viewer header while running. OCR on a 40-page
   scan is 30–90 s, so it needs to be leaveable: the job continues, and the
   document updates when the user returns.
7. **Failure** leaves everything untouched and says why. A failed OCR must
   never cost the user the document they already had.
8. **Search backfill.** `Annotation.searchText` and the document's own column
   are generated, so nothing to do — but note in `DATA_MODEL.md §8` that an
   OCR'd document only becomes searchable for its *content* once note pages
   or highlights quote it.

## Out of scope

Handwriting recognition. Per-page OCR. Re-anchoring existing annotations
(the geometry is unchanged, so they do not move).

## Key files

```
worker/jobs/document-ocr.ts
worker/lib/ocr.ts                    the subprocess wrapper, like soffice.ts
src/server/services/ingest/ocr.ts    enqueue + guard
src/app/api/documents/[documentId]/ocr/route.ts
src/components/viewer/OcrOffer.tsx
tests/integration/ingest/ocr.spec.ts
tests/fixtures/scan-no-text.pdf      an image-only fixture
```

## Gotchas

- `ocrmypdf` shells out to Ghostscript and Tesseract and is **slow and
  memory-hungry**. Give it the same treatment as LibreOffice in
  `worker/lib/run.ts`: `nice -n 10`, a hard `SIGKILL`, and **queue
  concurrency 1**. The 2 GB budget in `ARCHITECTURE.md §6` does not care that
  this is a different binary.
- `--optimize 1` rather than the default: higher levels invoke `pngquant` and
  `jbig2` and can double the runtime for a few percent of size.
- On macOS `ocrmypdf` is installed via Homebrew and works; the language packs
  are separate formulae (`tesseract-lang`). The Docker image already has ita
  and fra.

## Acceptance criteria

- [ ] An image-only PDF ingests with `hasTextLayer = false`, shows the OCR
      offer, and after OCR has a real selectable text layer.
- [ ] The page count, `Leaf` rows and every existing annotation are unchanged
      by OCR — asserted by comparing annotation geometry before and after.
- [ ] The original upload's sha256 is unchanged, and the pre-OCR normalised
      PDF still exists at its own key.
- [ ] An Italian scan is OCR'd with `ita`, not `eng` — asserted by checking
      that `perché` comes back with its accent.
- [ ] Killing the worker mid-OCR leaves the document usable and the job
      retried on restart.
- [ ] Worker RSS stays under 500 MB throughout, measured.
- [ ] OCR is never triggered by an upload, only by an explicit action.
