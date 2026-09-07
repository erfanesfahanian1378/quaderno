# Architecture

## 1. Shape of the system

One Next.js application, one Postgres database, one small worker process, one
object store. That is the whole system, and it is deliberate: this has to run
on a €5/month VPS, so every component that would otherwise be "obviously"
added (Redis, a separate API service, a headless Chrome pool, Elasticsearch)
has been replaced by something cheaper.

```
                    ┌──────────────────────────────┐
   browser ────────▶│  Caddy  (TLS, gzip/br, /_next│
   (PWA)            │         static caching)      │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  Next.js 15 (standalone)     │
                    │  · RSC pages                 │
                    │  · Route handlers = the API  │
                    │  · Server Actions for mutations
                    │  · Auth.js v5 session        │
                    └───┬───────────────┬──────────┘
                        │               │
             ┌──────────▼──────┐   ┌────▼──────────────┐
             │  PostgreSQL 16  │   │  S3-compatible    │
             │  · app data     │   │  store (MinIO /   │
             │  · pg-boss jobs │   │  R2 / B2)         │
             └──────────▲──────┘   └────▲──────────────┘
                        │               │
                    ┌───┴───────────────┴──────────┐
                    │  Worker (Node, pg-boss)      │
                    │  · docx/pptx → PDF (soffice) │
                    │  · image → PDF               │
                    │  · thumbnails, OCR, reaper   │
                    └──────────────────────────────┘
```

**No Redis.** The job queue is [`pg-boss`](https://github.com/timgit/pg-boss),
which runs on the Postgres we already pay for. Rate limiting uses a Postgres
token-bucket table. Session state lives in the `Session` table. This saves
~150 MB of RSS and one moving part.

**No headless Chrome.** PDF rendering happens in the _browser_ with pdf.js, and
so does PDF export (pdf-lib in a web worker). The server rasterises exactly one
thing: a first-page thumbnail at ingest.

---

## 2. The rendering decision

> **The server never rasterises pages for viewing. The client does.**

This is the single biggest reason the app fits on a cheap box. A server-side
render pipeline for a 40-page handout is hundreds of megabytes of transient
memory and seconds of CPU per open. pdf.js in the browser costs the server one
signed URL and a byte-range-served file.

What follows from it:

- The viewer requests the normalised PDF via a **short-lived signed URL**
  (5 min TTL) straight from object storage. Bytes never pass through Node.
- pdf.js is configured with `disableAutoFetch` and `rangeChunkSize`, so opening
  page 1 of a 200-page PDF downloads ~100 KB, not the whole file.
- Only a window of pages is kept rendered (`RENDER_WINDOW = 3` on mobile,
  `5` on desktop). Off-window canvases are released, replaced by a
  correctly-sized placeholder so scroll position never jumps.
- Text layer and annotation layer render as separate absolutely-positioned
  overlays above the canvas, sharing one CSS transform for zoom.

---

## 3. Ingest pipeline

The user's requirement — _"if adding docx is hard, add a convert engine so it
converts docx to pdf, then we can use it, but it should have all features"_ —
is exactly the right call, and it is the architecture:

> **PDF is the universal substrate. Everything becomes a PDF at ingest, and
> the annotation engine only ever has to understand PDF.**

```
upload ──▶ validate (magic bytes, size, MIME allowlist)
       ──▶ store original, compute sha256, dedupe
       ──▶ enqueue "document.ingest"
             │
             ├─ pdf   → validate + repair (qpdf --decrypt --linearize)
             ├─ docx  ─┐
             ├─ pptx   ├→ soffice --headless --convert-to pdf
             ├─ odt   ─┘
             ├─ png/jpg/heic → sharp → img2pdf (one page per image)
             └─ txt/md → server-side markdown → PDF
       ──▶ probe page count + text layer presence
       ──▶ if no text layer and OCR enabled → ocrmypdf --skip-text
       ──▶ create Leaf rows (one per PDF page)
       ──▶ render page-1 thumbnail (webp, 320px)
       ──▶ status = READY, notify the client over SSE
```

**LibreOffice is the memory hog and is treated as one.** It is spawned as a
one-shot subprocess, never kept resident:

- queue concurrency for conversion jobs is **1**
- `nice -n 10`, hard `SIGKILL` at 120 s
- isolated `-env:UserInstallation=file:///tmp/lo-$JOBID` profile per run, so
  parallel or crashed runs cannot corrupt a shared profile
- peak ~350 MB, released the moment it exits

Fidelity is not perfect and the UI must say so. When
`conversionEngine = "libreoffice"`, the document detail panel shows _"Converted
from .docx — layout may differ slightly. The original is kept and can be
downloaded."_ Honest beats surprising.

---

## 4. Module boundaries

```
src/
  app/                      Next.js routes (thin: parse, authorise, delegate)
    (marketing)/            public landing
    (auth)/                 sign in / up / reset
    (app)/                  authenticated shell
      dashboard/
      l/[languageId]/       language home, classes, library
      d/[documentId]/       the viewer
      study/                timer, log, stats
      settings/
    api/                    route handlers — see API.md
  server/
    auth/                   Auth.js config, password hashing, guards
    repositories/           the ONLY place Prisma is imported
    services/               business logic; pure-ish, takes repos by injection
      ingest/               conversion orchestration
      annotations/          geometry validation, anchoring, delta sync
      composition/          leaves, fractional indexing, reordering
      study/                sessions, aggregates, streaks, goals
      export/               server-side export fallback
    storage/                S3 client, signed URLs, key builders
    jobs/                   pg-boss job definitions + handlers
    validation/             Zod schemas shared by client and server
  lib/                      framework-agnostic utilities
  components/
    ui/                     design-system primitives (see DESIGN_BRIEF.md)
    viewer/                 pdf.js canvas, text layer, annotation layer
    editor/                 markdown note editor
    charts/                 study charts, heatmap, goal ring
  workers/                  browser web workers (pdf.js, export, ink smoothing)
worker/                     the SEPARATE Node process (pg-boss consumer)
```

**The one rule that keeps this maintainable:** Prisma is imported in
`src/server/repositories/**` and nowhere else. Services take repositories as
arguments, which makes them unit-testable without a database.

---

## 5. Sync and offline

The app is a PWA and must survive a metro tunnel between two classes.

- **Service worker** precaches the app shell. Documents opened in the last 7
  days keep their normalised PDF in the Cache API (capped at 200 MB, LRU).
- **Annotation writes** go to an IndexedDB outbox first, then to the server.
  Each carries a client-generated `clientId` UUID; the server upsert is keyed
  on `(userId, clientId)`, so replaying the outbox is idempotent.
- **Pull** is a delta: `GET /api/documents/:id/annotations?since=<ISO>`
  returns creates, updates and tombstones (`deletedAt`) since that timestamp.
- **Conflicts** resolve last-write-wins per annotation, compared on
  `updatedAt`. Annotations are small and independent; operational transform
  would be unjustified complexity here.
- The UI shows a **sync state** per document: `synced` / `pending n` /
  `offline`. Never silently pretend a queued write landed.

---

## 6. Performance budget

Target box: **2 vCPU / 2 GB RAM / 40 GB SSD**, roughly €5/month.

| Process                                                       |    Steady RSS | Notes                           |
| ------------------------------------------------------------- | ------------: | ------------------------------- |
| Next.js (standalone, `NODE_OPTIONS=--max-old-space-size=512`) |    300–420 MB |                                 |
| Postgres 16 (`shared_buffers=256MB`, `max_connections=20`)    |       ~350 MB |                                 |
| Worker, idle                                                  |        ~90 MB |                                 |
| Worker, during a docx conversion                              | +350 MB burst | concurrency 1, 120 s cap        |
| Caddy                                                         |        ~25 MB |                                 |
| **Peak total**                                                |   **~1.2 GB** | ~800 MB headroom for page cache |

Add 2 GB of swap. It is never hit in steady state; it prevents the OOM killer
from taking down Postgres during a conversion burst.

Latency budget:

| Path                                         | Target             |
| -------------------------------------------- | ------------------ |
| Cached RSC page, p95 TTFB                    | < 200 ms           |
| API read (list documents), p95               | < 120 ms           |
| First page of a PDF painted, 4G mobile       | < 1.5 s            |
| Annotation write acknowledged optimistically | 0 ms (local-first) |
| Annotation write durable, p95                | < 250 ms           |
| 20-page docx → READY                         | < 25 s             |

Enforcement:

- Prisma connection pool capped at 8; `pgbouncer` is _not_ needed at this size.
- `next build` output is checked against a bundle budget in CI: the viewer
  route may not exceed **250 KB gzipped** of first-load JS excluding pdf.js
  (which is lazy-loaded and cached separately).
- No `SELECT *` through relations in list views — repositories use explicit
  `select`.
- Charts read `StudyDayAggregate` only.
- Every list endpoint is cursor-paginated. No `OFFSET` anywhere.

---

## 7. Security posture

- Passwords: **argon2id**, `m=19456, t=2, p=1`. Never bcrypt.
- Sessions: database-backed, `httpOnly` `SameSite=Lax` cookies, 30-day sliding
  expiry, rotated on privilege change.
- Every route handler starts with `const ctx = await requireUser()`. There is
  no "optional auth" branch inside app routes.
- **IDOR is the top risk in this app** (documents are just IDs). The
  repository layer's mandatory `userId` scoping is the control; there is a
  test suite (`tests/security/tenancy.spec.ts`) that walks every repository
  function with a foreign id and asserts a not-found.
- Uploads: MIME allowlist verified by magic bytes (not the client's header),
  50 MB per file cap, per-user quota enforced before the write, filenames
  sanitised and never used as storage keys.
- Signed URLs are 5-minute, single-object, read-only.
- CSP with no `unsafe-eval` except the pdf.js worker origin; `frame-ancestors
'none'`; uploads served from a distinct origin/bucket so a malicious SVG or
  HTML file cannot run in the app's origin.
- Rate limits: 5 failed logins / 15 min / account, 20 uploads / hour / user,
  600 API requests / min / user — all in Postgres.

---

## 8. Observability on a budget

- Structured JSON logs to stdout (`pino`), rotated by the platform.
- `/api/health` returns db, storage and queue-depth checks; used by the
  container healthcheck.
- `/api/metrics` exposes Prometheus text, protected by a bearer token —
  scrape it or don't, it costs nothing when unscraped.
- Job failures write an `AuditLog` row and surface in the UI on the affected
  document rather than dying silently.

---

## 9. Deployment

`docker-compose.yml` with four services: `web`, `worker`, `db`, `caddy`
(plus `minio` in the local profile only). Production uses managed object
storage (Cloudflare R2 or Backblaze B2) so the VPS disk only holds Postgres.

- Images are multi-stage; the runtime image is `node:22-slim` plus
  `libreoffice-core`, `libreoffice-writer`, `libreoffice-impress`, `qpdf`,
  `poppler-utils` (page-1 thumbnails) and fonts — **only in the worker image**. The web image stays slim.
- Migrations run as a one-shot `web` command before the server starts, guarded
  by a Postgres advisory lock so two instances cannot race.
- Backups: nightly `pg_dump | zstd` to the object store, 14 daily + 8 weekly,
  and a documented restore drill in `docs/RUNBOOK.md` (written in PHASE-09).
- A single `docker compose up` on a clean machine with a `.env` must produce a
  working app. That is a CI job, not an aspiration.
