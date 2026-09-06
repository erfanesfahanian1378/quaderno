# PHASE 04 — Ingest & conversion pipeline

**Goal:** a user uploads a `.docx`, `.pptx`, an image or a PDF, and a short
time later has a `READY` document whose pages exist as `Leaf` rows. This is the
phase that makes "it should have all features on Word files too" true, by
making sure there is no Word file left by the time the viewer sees it.

**Prerequisites:** Phases 01–03. Read `ARCHITECTURE.md §3` before starting.

## Scope

1. **Presigned upload flow** — `POST /api/uploads/presign` → direct `PUT` to
   storage → `POST /api/uploads/complete`, exactly as specified in `API.md`.
   Bytes must never pass through the Node process.
2. **Validation** — MIME allowlist checked against **magic bytes** server-side
   after upload (never trust the client's header), 50 MB cap, per-user quota
   checked before presigning, sha256 dedupe against `SourceFile.checksumSha256`.
3. **`document.ingest` job** in the worker, with these steps and per-step
   logging into `SourceFile.conversionLog`:
   - PDF → `qpdf --decrypt --linearize` repair pass
   - docx/doc/odt/pptx/ppt/odp/rtf → `soffice --headless --convert-to pdf`,
     isolated `-env:UserInstallation` profile per job, `nice -n 10`,
     `SIGKILL` at 120 s, **queue concurrency 1**
   - png/jpg/webp/heic → `sharp` normalise → one PDF page per image
   - txt/md → server-side markdown → PDF
4. **Probe** — page count and text-layer presence (`hasTextLayer`); store
   `conversionEngine`, `conversionMs`, `pdfPageCount`, `pdfByteSize`.
5. **Leaf creation** — one `SOURCE_PAGE` leaf per PDF page, positions
   `1.0, 2.0, 3.0 …`, in a single transaction with the status flip to `READY`.
6. **Thumbnail** — page-1 render to 320 px webp. This is the _only_ server-side
   rasterisation in the product; keep it that way.
7. **OCR** — a separate `document.ocr` job (`ocrmypdf --skip-text`), offered in
   the UI when `hasTextLayer = false`, never run automatically on upload.
8. **Progress** — `GET /api/documents/:id/events` as SSE emitting
   `{ status, step, pct }`; failures also persist on the document so an offline
   client sees them on reconnect.
9. **Failure handling** — three retries with backoff for transient errors, then
   `FAILED` with a human-readable reason. The original stays downloadable, and
   the UI offers "retry" and "download original".
10. **Library UI** — design brief §5.6: grid and list, filters, search field
    (wired in Phase 09), drag-and-drop dropzone with per-file progress, and the
    converting / failed card states.
11. **Document detail panel** — source file info, the "converted from .docx —
    layout may differ, original kept" notice, tags, class link.

## Out of scope

Viewing pages (Phase 05). Note pages (Phase 07).

## Key files

```
src/server/services/ingest/{index.ts,detect.ts,convert.ts,probe.ts,leaves.ts}
src/server/repositories/{document.ts,source-file.ts,leaf.ts}
src/app/api/uploads/{presign,complete}/route.ts
src/app/api/documents/**
worker/jobs/{document-ingest.ts,document-ocr.ts,thumbnail.ts}
worker/lib/{soffice.ts,qpdf.ts,run.ts}
src/components/library/{DocumentCard.tsx,Dropzone.tsx,ConversionCard.tsx}
src/app/(app)/l/[languageId]/library/page.tsx
docker/worker.Dockerfile
tests/integration/ingest/**  tests/fixtures/**
```

## Acceptance criteria

- [ ] A 20-page `.docx` reaches `READY` in under 25 s on the target box, with
      20 `SOURCE_PAGE` leaves and a thumbnail.
- [ ] `.pptx`, `.odt`, `.rtf`, a multi-page PDF, a JPEG and a `.md` file each
      ingest correctly — one integration test per format, with fixtures in the
      repo.
- [ ] An encrypted PDF is repaired by qpdf, or fails with a clear reason and a
      working "download original".
- [ ] A file renamed to `.docx` but actually a ZIP bomb is rejected by the
      magic-byte check and never reaches soffice.
- [ ] Killing the worker mid-conversion leaves the document `CONVERTING`, and
      the job is retried and completes on restart — no stuck documents.
- [ ] Two simultaneous docx uploads run **sequentially**; worker RSS stays
      under 500 MB throughout, asserted by a scripted measurement in the test.
- [ ] Uploading the same file twice creates a second document but reuses the
      stored blob and skips conversion.
- [ ] `soffice` is absent from the **web** image and present in the worker
      image.
