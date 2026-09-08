<h1 align="center">Quaderno</h1>

<p align="center">
  <strong>A study notebook for language learners.</strong><br>
  Bring your class handouts in, annotate them properly, write your own pages
  between them, and see exactly how many hours you actually studied this week.
</p>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000?logo=nextdotjs">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white">
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

---

## Why this exists

Language classes generate a mess: a PDF handout from Tuesday, a Word document
of exercises, a photo of the whiteboard, and your own notes scattered across
three apps. Nothing connects them, and nothing tells you whether you actually
put in five hours this week or forty minutes.

Quaderno is one place for all of it, per language, per class, with a real
annotation layer and honest time tracking. It is built to run on a €5/month
VPS, so self-hosting it costs about what a coffee does.

## Features

**Materials**

- Upload PDFs, Word (`.docx`/`.doc`/`.odt`), PowerPoint, images, plain text
- Everything is converted to PDF on ingest, so **every feature works on every
  format** — there is no second-class file type
- The original file is stored untouched and always downloadable
- OCR for scanned handouts, so even a photocopy becomes selectable text

**Annotation**

- Highlight, underline, strike through — with named colours ("yellow =
  grammar", "pink = vocabulary")
- Freehand pen with pressure support and palm rejection on tablets
- Typed text boxes, arrows, boxes and circles anywhere on the page
- Threaded comments anchored to a highlight or pinned to a spot
- **Insert your own pages anywhere in a document** — between page 3 and page 4
  of the teacher's handout, without ever modifying the teacher's file
- Note-page templates: blank, lined, grid, Cornell, vocabulary table, verb
  conjugation table
- Export a flattened PDF, a layered PDF that stays editable in Acrobat, or a
  notes-only revision handout

**Study tracking**

- A live timer that knows which language and which document you are in
- Manual logging for the studying you did away from the screen
- Weekly hour goals per language, with pace and a progress ring
- Weekly and monthly charts, per-language comparison, a year heatmap, streaks
- A recurring class schedule that turns into logged sessions when you confirm
  you attended

**Everything else**

- Multi-user from day one, with proper isolation between accounts
- Installable PWA — works on phone, tablet and desktop from one codebase
- Offline-tolerant: annotate on the metro, it syncs when you surface
- Light and dark themes, accent colour per language
- Full data export and account deletion, because it is your notebook

## Stack

| Layer      | Choice                                                 | Why                                              |
| ---------- | ------------------------------------------------------ | ------------------------------------------------ |
| Framework  | Next.js 15 (App Router), TypeScript strict             | One deployable, RSC keeps client JS small        |
| Database   | PostgreSQL 16 + Prisma 6                               | Relational data, and it doubles as the job queue |
| Auth       | Auth.js v5, argon2id, DB sessions                      | No third-party dependency, no per-MAU bill       |
| Storage    | S3-compatible (MinIO local, R2/B2 in prod)             | Blobs off the VPS disk                           |
| Jobs       | pg-boss on the same Postgres                           | No Redis — saves ~150 MB RSS                     |
| Conversion | LibreOffice headless, qpdf, ocrmypdf, poppler         | Spawned per job, never resident                  |
| PDF        | pdf.js (view) + pdf-lib (export, in-browser)           | The server never rasterises a page               |
| UI         | Tailwind CSS 4, Radix primitives, custom design system | See `docs/DESIGN_BRIEF.md`                       |
| Charts     | visx / Recharts                                        | Small, composable                                |
| Tests      | Vitest, Playwright, Testing Library                    |                                                  |

## Quick start

```bash
git clone git@github.com:erfanesfahanian1378/quaderno.git
cd quaderno
cp .env.example .env          # generate AUTH_SECRET with: openssl rand -base64 32

docker compose --profile dev up -d   # postgres + minio
pnpm install
pnpm db:migrate
pnpm db:seed                  # demo user: demo@quaderno.app
pnpm dev                      # http://localhost:3000

# in a second terminal — conversion, OCR and thumbnails need it
pnpm worker:dev
```

Requires Node 22+, pnpm 9+, Docker. Outside Docker the worker also needs:

```bash
brew install --cask libreoffice     # .docx / .pptx conversion
brew install qpdf ocrmypdf          # PDF repair, and OCR for scans
brew install poppler                # pdftocairo, for page-1 thumbnails
                                    # (ocrmypdf pulls it in anyway)
brew install tesseract-lang         # OCR language packs — Homebrew's
                                    # tesseract ships English only
```

Without `tesseract-lang`, OCR falls back to English and says so in the
conversion log rather than failing silently.

### Testing on a phone

The LAN address is **not a secure context**, and browsers hide
`serviceWorker`, `caches`, `PushManager` and `getUserMedia` outside one — not
block them, hide them. Measured:

```
localhost:3000       secure: true    serviceWorker: yes
192.168.1.235:3000   secure: false   serviceWorker: NO
```

So offline mode, reminders and voice recording cannot work on a phone over
`http://192.168.x.x`, however correct the code is. Add to Home Screen there
gives a shortcut with nothing behind it.

Serve it over HTTPS instead:

```bash
brew install mkcert
mkcert -install                      # trusts the root on THIS Mac
mkcert -cert-file certs/local.pem -key-file certs/local-key.pem \
       192.168.1.235 localhost 127.0.0.1

pnpm dev        # terminal 1
pnpm https      # terminal 2 — TLS on :3443, forwards to :3000
```

Object storage needs TLS too — `pnpm https` puts it on **9443** and `.env` must
point at it:

```
S3_PUBLIC_ENDPOINT="https://<lan-ip>:9443"
```

A plain-http endpoint is blocked as **mixed content** on an https page, and the
symptom is a viewer full of blank grey pages with the network working
perfectly. Presigned urls survive the proxy because SigV4 covers the Host
header and it is forwarded unchanged.

Then on the phone, **once**:

1. Open `https://<lan-ip>:3443/mkcert-root.crt` and let it download.
2. Android: Settings → Security → Encryption & credentials → Install a
   certificate → **CA certificate** → pick the downloaded file.
   iOS: Settings → General → VPN & Device Management → install the profile,
   then Settings → General → About → Certificate Trust Settings → enable it.
3. Open `https://<lan-ip>:3443`.

A service worker needs a genuinely **trusted** certificate — tapping through a
browser's "proceed anyway" warning is not enough, the worker script alone will
still be refused. That is why the root has to be installed rather than
bypassed.

`certs/` is gitignored: the private key must never be committed.

> **Already running Postgres locally?** Set `DB_PORT` in `.env` to something
> free (say `5433`) and change the port in `DATABASE_URL` and
> `QUEUE_DATABASE_URL` to match. On macOS a native listener on 5432 wins for
> connections from the host even though Docker also binds the port, and the
> symptom is an unhelpful `P1010: User was denied access` from Prisma.

Useful during development:

```bash
open http://localhost:3000/dev/tokens   # every colour, type step, radius and
                                        # elevation in both themes (dev only)
pnpm queue:noop "hello"                 # proves the worker is consuming jobs
```

## Repository map

```
prisma/schema.prisma      Canonical data model — the source of truth
src/app/                  Routes: pages + /api route handlers
src/server/               Repositories, services, jobs, storage, validation
src/components/           ui/ (design system), viewer/, editor/, charts/
worker/                   Separate Node process: conversion, OCR, reaper
docs/
  ARCHITECTURE.md         System design, module boundaries, perf budget
  DATA_MODEL.md           Why the schema is shaped this way
  API.md                  Every endpoint and its contract
  ANNOTATION_ENGINE.md    The hard part, in detail
  DESIGN_BRIEF.md         Brief for Claude Design
  phases/PHASE-01..09.md  The build plan, one prompt-ready brief per phase
CLAUDE.md                 Conventions Claude Code must follow in this repo
```

## Development workflow

The build is split into nine phases in [`docs/phases/`](docs/phases). Each is a
self-contained brief with scope, non-goals, the files to touch and acceptance
criteria, sized for one Claude Code session. Work them in order — later phases
assume the earlier ones landed.

```bash
pnpm dev            pnpm worker:dev
pnpm test           pnpm test:e2e        pnpm test:perf
pnpm lint           pnpm typecheck
pnpm db:migrate     pnpm db:studio       pnpm db:reset
pnpm analyze        # bundle budget report
```

## Deployment

`docker compose up` on a 2 vCPU / 2 GB VPS. Steady-state footprint is about
1.2 GB with a 350 MB burst during a document conversion. Details, resource
tuning and the backup/restore drill are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §6 and §9.

## What works today

Every item below has been exercised end to end in a real browser, not just
unit-tested.

- [x] Register, sign in, reset a password, sign out
- [x] Add languages, set levels, accents and weekly goals
- [x] Upload a PDF, Word file, slide deck, image or markdown; everything is
      converted to PDF and the original is kept byte-identical. A `.docx`
      converts through headless LibreOffice in ~1.4s and comes out with a real
      selectable text layer, so every feature works on it.
- [x] Read a document in a virtualised pdf.js viewer with a page rail
- [x] Select text and highlight, underline or strike it through, in five
      labelled colours
- [x] Draw freehand with pressure and palm rejection; erase strokes
- [x] Insert your own note page anywhere, including between two pages of the
      teacher's handout, from six templates
- [x] Edit note pages in place with debounced autosave and conflict detection
- [x] Export a flattened PDF, or a notes-only revision handout, from the
      browser
- [x] Start a timer, log time manually, see weekly goal rings, a stacked week
      chart, a year heatmap and streaks
- [x] Search across documents, note pages, highlights, comments and classes,
      ignoring accents
- [x] Comment on a highlight, resolve the thread, and work through every mark
      on a document from the right rail
- [x] Run OCR on a scanned handout and get a real, selectable text layer — the
      original is never touched, the OCR'd copy is a new object
- [x] Set a recurring class, confirm or skip an occurrence, and have that feed
      the dashboard — DST-safe, because the wall time is anchored in the
      user's own zone
- [x] Install the app, keep a document for offline reading, and open it in a
      tunnel — including byte ranges, which is what pdf.js actually asks for
- [x] Export a layered PDF whose marks stay editable in Acrobat and Preview,
      queue a server-side export past 150 leaves, and print a document with
      every page rendered first
- [x] Fill in a vocabulary table and review it: SM-2 scheduling, four grades
      with the interval each will produce, and read-aloud on the card
- [x] Record yourself on a note page and compare it against the reference voice
- [x] Share a document read-only with a link, see how often it was opened, and
      revoke it
- [x] Export any language, document or page as a TSV that Anki imports

### Known gaps

Everything in `docs/phases/` is built. What is left is operational rather than
missing features:

| Area | Where it stands |
|---|---|
| Deployment | `docs/RUNBOOK.md` describes the VPS setup; nothing has been deployed to one. The compose file is the local profile only. |
| `.apkg` export | Anki imports the TSV natively. A real `.apkg` means shipping ~1.5 MB of sql.js to write a SQLite file, and is worth doing only if someone asks. |
| FSRS | Scheduling is SM-2. Every `ReviewLog` row records the interval and ease on both sides of the grade, which is exactly what FSRS needs as training data if that changes. |
| Real-time collaboration | Out of scope by design — ARCHITECTURE.md §1 says so, and the local-first write path assumes a single writer. |

## Phase briefs

All fifteen are in [`docs/phases/`](docs/phases), each sized for one session
and each written before the code it describes. The index in
[`docs/phases/README.md`](docs/phases/README.md) explains the ordering.

## License

MIT
