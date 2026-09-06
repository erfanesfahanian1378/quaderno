# Build plan

Nine phases, each sized for roughly one Claude Code session. Work them in
order — every phase assumes the previous ones landed and their tests pass.

| #   | Phase                                              | Ships                                                             |
| --- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 01  | [Foundation & tooling](PHASE-01-foundation.md)     | Repo, Next.js, Postgres, Docker, CI, design tokens                |
| 02  | [Auth & multi-tenancy](PHASE-02-auth.md)           | Accounts, sessions, the repository scoping rule, tenancy tests    |
| 03  | [Learning structure](PHASE-03-structure.md)        | Languages, courses, classes, the app shell and dashboard skeleton |
| 04  | [Ingest & conversion](PHASE-04-ingest.md)          | Upload, docx/pptx/image → PDF, leaves, thumbnails, OCR            |
| 05  | [Document viewer](PHASE-05-viewer.md)              | pdf.js viewer, virtualised pages, PWA, mobile gestures            |
| 06  | [Annotation engine](PHASE-06-annotations.md)       | Highlight, ink, text boxes, shapes, comments, offline sync        |
| 07  | [Composition & notes](PHASE-07-composition.md)     | Note pages, templates, reordering, insert-between, export         |
| 08  | [Study tracking](PHASE-08-study.md)                | Timer, manual log, schedule, goals, charts, heatmap, streaks      |
| 09  | [Search, hardening, deploy](PHASE-09-hardening.md) | Search, rate limits, perf budgets, backups, runbook               |

## How to run a phase

Start a session with:

> Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`,
> `docs/API.md` and `docs/phases/PHASE-0X-<name>.md`. Implement that phase in
> full, including its tests. Stop and ask before deviating from a spec.

Each phase doc is written to be pasted in as-is. Branch per phase
(`phase/06-annotation-engine`), and do not start the next phase until the
current one's acceptance criteria all pass.

## Definition of done, every phase

- [ ] Acceptance criteria in the phase doc all met
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green
- [ ] New endpoints match `docs/API.md`, or the doc was updated in the same PR
- [ ] Migrations included and reversible
- [ ] No `PrismaClient` import outside `src/server/repositories/**`
- [ ] Tenancy test suite still green
- [ ] Nothing added to the bundle budget without a note in the PR body
