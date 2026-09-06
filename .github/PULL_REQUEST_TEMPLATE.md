## What changed

<!-- One paragraph. What a reviewer needs to know before reading the diff. -->

## Phase

<!-- e.g. PHASE-04 — Ingest & conversion. Link the phase doc. -->

## Acceptance criteria now met

<!-- Copy the checkboxes from the phase doc and tick what this PR delivers.
     Leave the unticked ones visible; a partial phase is fine, a silent one
     is not. -->

- [ ]

## Migrations

- [ ] None
- [ ] Included, and reversible
- [ ] `prisma migrate diff` output reviewed (paste it below)

## Deviations from the specs

<!-- CLAUDE.md: "Say so in the PR body, implement what you believe is right,
     and update the spec in the same PR." Silent divergence between docs and
     code is worse than either being wrong. Write "None" if there are none. -->

## New runtime dependencies

<!-- CLAUDE.md rule 10: no new runtime dependency without what it costs in
     bundle size or RSS and what it replaces. The 2 GB budget is a real
     constraint. Write "None" if there are none. -->

## Checklist

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green
- [ ] No `PrismaClient` import outside `src/server/repositories/**`
- [ ] Every repository function takes `ctx: { userId }` and scopes its own query
- [ ] Another user's record returns 404, never 403
- [ ] Annotation geometry stays normalised `0..1`
- [ ] Colours are token keys, no hex literals outside `tokens.css`
- [ ] No `any`
- [ ] Every input validated at the boundary with Zod
- [ ] Cursor pagination only — no `OFFSET`, no unbounded list query
- [ ] Tenancy suite still green
- [ ] New endpoints match `docs/API.md`, or the doc was updated here
- [ ] Empty, loading and error states implemented for anything user-facing
