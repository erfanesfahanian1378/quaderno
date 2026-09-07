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
| Conversion | LibreOffice headless, qpdf, ocrmypdf, sharp            | Spawned per job, never resident                  |
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

Requires Node 22+, pnpm 9+, Docker. For `.docx` conversion outside Docker you
also need LibreOffice on your `PATH` (`brew install --cask libreoffice`).

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

### Not built yet

Each of these is written up as a phase brief in
[`docs/phases/`](docs/phases), sized for one session, in the same format as
the nine that are done. The index in
[`docs/phases/README.md`](docs/phases/README.md) explains the ordering.

| # | Phase | What is missing |
|---|---|---|
| [10](docs/phases/PHASE-10-comments.md) | Comments & the revision rail | The API, repository and schema are done; the right rail and the annotations list are not |
| [11](docs/phases/PHASE-11-ocr.md) | Scanned handouts: OCR | `ocrmypdf` is installed and the queue exists; nothing consumes it |
| [12](docs/phases/PHASE-12-schedule.md) | The schedule | `ScheduledClass` is in the schema; the RRULE expansion and attendance confirmation are not |
| [13](docs/phases/PHASE-13-offline.md) | Offline & installable | Writing already survives offline; reading does not |
| [14](docs/phases/PHASE-14-export.md) | Export, completely | Layered export and server-side export past 150 leaves |
| [15](docs/phases/PHASE-15-study-loop.md) | The study loop | Spaced repetition, audio attachments, share links, Anki export |

## Roadmap

The roadmap is [PHASE 15](docs/phases/PHASE-15-study-loop.md): spaced
repetition built from the vocabulary tables you already fill in, audio
attachments to compare against the read-aloud voice, shared read-only links,
and Anki export.

## License

MIT
