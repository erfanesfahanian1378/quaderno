# Working in this repository

Read this before making any change. It exists to keep nine sessions of work
consistent with each other.

## Read first

| When                               | Read                                              |
| ---------------------------------- | ------------------------------------------------- |
| Always                             | this file                                         |
| Touching data                      | `prisma/schema.prisma`, then `docs/DATA_MODEL.md` |
| Touching an endpoint               | `docs/API.md`                                     |
| Touching the viewer or annotations | `docs/ANNOTATION_ENGINE.md`                       |
| Touching UI                        | `docs/DESIGN_BRIEF.md`                            |
| Starting a work session            | the matching `docs/phases/PHASE-XX.md`            |

If a doc contradicts the code, the schema wins for data questions and the code
wins for behaviour questions — then fix the doc in the same PR.

## Hard rules

1. **Prisma is imported only in `src/server/repositories/**`.** Services take
   repositories as arguments. Route handlers call services. A `PrismaClient`
   import anywhere else is a review rejection.
2. **Every repository function takes `ctx: { userId: string }` as its first
   argument and injects `userId` into the `where` clause itself.** Never trust
   a caller to scope a query.
3. **A record owned by another user returns 404, never 403.**
4. **Annotation geometry is normalised (`0..1`) at all times.** Conversion to
   device pixels happens only in `src/components/viewer/coords.ts`.
5. **Colours are token keys, never hex literals, in the database and in
   component props.** Hex values live only in the token definitions.
6. **No `any`.** `strict: true`, `noUncheckedIndexedAccess: true`. If a type is
   genuinely unknown, use `unknown` and narrow it.
7. **Validate every input at the boundary with Zod**, from
   `src/server/validation/**`, and infer client types from the same schemas.
8. **Never mutate an uploaded file.** Originals are immutable. Derived
   artefacts get new storage keys.
9. **Cursor pagination only.** No `OFFSET`, no unbounded list query.
10. **No new runtime dependency** without a note in the PR body saying what it
    costs in bundle size or RSS and what it replaces. The 2 GB budget in
    `docs/ARCHITECTURE.md` §6 is a real constraint, not a preference.

## Conventions

**Naming**

- Files: `kebab-case.ts`. React components: `PascalCase.tsx`.
- React components `PascalCase`, hooks `useThing`, server-only modules end in
  `.server.ts`.
- Booleans read as assertions: `isReady`, `hasTextLayer`, `canAnnotate`.
- Database columns `camelCase` (Prisma default), enums `SCREAMING_SNAKE`.

**Components**

- Default to a Server Component. Add `"use client"` only when the component
  needs state, effects, or browser APIs — and push it as far down the tree as
  possible.
- Presentational components take data as props and do not fetch.
- Everything visual composes from `src/components/ui/**`. If a primitive is
  missing, add it there rather than styling ad hoc in a feature component.

**Errors**

- Throw typed `ApiError`s from services; a single route wrapper maps them to
  the response shape in `docs/API.md`.
- Never swallow an error into a silent empty state. Surface it, log it with
  context, and give the user a retry.

**Async & data**

- All mutations that touch two tables run in a `prisma.$transaction`. Writing a
  `StudySession` without updating `StudyDayAggregate` in the same transaction
  is a bug.
- Long work goes to pg-boss, never into a request. A route handler that takes
  more than ~1 s of CPU is misplaced.

## Testing expectations

Each phase ships with its tests. A phase is not done without them.

- **Unit** (Vitest) for services and pure logic: fractional indexing,
  coordinate conversion, RRULE expansion, aggregate recomputation, streaks
  across time-zone boundaries.
- **Integration** for repositories against a real Postgres (Testcontainers or
  the compose db), including the tenancy suite in
  `tests/security/tenancy.spec.ts` that calls every repository function with a
  foreign id and asserts not-found.
- **E2E** (Playwright) for the flows that define the product: upload a .docx →
  it converts → highlight a phrase → insert a note page after it → reload →
  everything is still there.
- **Perf** (`tests/perf/`) for the viewer scroll budget and the bundle budget.
  These fail the build; they are not advisory.

Do not write tests that assert implementation details of React components.
Test what the user can observe.

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `perf:`, `docs:`,
  `test:`, `chore:`, with a scope where it helps (`feat(viewer): …`).
- One phase per branch: `phase/06-annotation-engine`.
- The PR body states: what changed, which acceptance criteria from the phase
  doc are now met, migrations included, and any deviation from the specs with
  its reason.

## When you disagree with a spec

Say so in the PR body, implement what you believe is right, and update the
spec in the same PR. Silent divergence between docs and code is worse than
either being wrong.
