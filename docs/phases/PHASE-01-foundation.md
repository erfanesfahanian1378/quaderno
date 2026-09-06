# PHASE 01 — Foundation & tooling

**Goal:** a repository that builds, tests, lints, migrates and boots with one
command, with the design tokens in place so no later phase invents a colour.

**Prerequisites:** none.

## Scope

1. **Project init** — Next.js 15 App Router, TypeScript `strict: true` +
   `noUncheckedIndexedAccess: true`, pnpm, Node 22. `output: "standalone"`.
2. **Tailwind CSS 4** wired to the token set in `docs/DESIGN_BRIEF.md §3`.
   Tokens live in `src/styles/tokens.css` as CSS custom properties for both
   themes, exposed to Tailwind as theme values. **Every colour in the brief,
   including the five highlighter colours and their dark-mode values.**
3. **Theme switching** — `light | dark | system`, no flash of wrong theme
   (inline script in `<head>` reading the cookie/localStorage before paint).
4. **Prisma 6** with `prisma/schema.prisma` copied in from the spec. First
   migration. `pnpm db:migrate`, `db:reset`, `db:studio`, `db:seed` scripts.
5. **Docker Compose** — `db` (postgres:16-alpine, tuned per
   `ARCHITECTURE.md §6`), `minio` + `createbuckets` under a `dev` profile.
   `.env.example` with every variable documented in a comment.
6. **Worker skeleton** — `worker/index.ts`, pg-boss connected to the same
   Postgres, one `noop` job proving end-to-end enqueue → consume. `pnpm
worker:dev` with tsx watch.
7. **Storage adapter** — `src/server/storage/` with an S3 client, key builders
   from `DATA_MODEL.md §5`, `putObject`, `getSignedReadUrl`,
   `getSignedUploadUrl`, `deletePrefix`. Works against MinIO locally.
8. **Error and logging plumbing** — `ApiError` class, the route wrapper that
   maps it to the response shape in `API.md`, `pino` logger with request ids.
9. **Testing setup** — Vitest (unit + integration against the compose db),
   Playwright with a single smoke test, Testing Library.
10. **CI** (GitHub Actions) — install, typecheck, lint, unit, integration
    against a service Postgres, build, and a bundle-size report.
11. **Base layout** — `src/app/layout.tsx` with fonts self-hosted via
    `next/font/local`, the token stylesheet, and `<html>` theme attribute.
12. **Repo hygiene** — `.editorconfig`, ESLint flat config with a rule banning
    `@prisma/client` imports outside `src/server/repositories/**`, Prettier,
    `lint-staged` + `husky`, `.github/PULL_REQUEST_TEMPLATE.md` matching
    `CLAUDE.md`, MIT `LICENSE`.

## Out of scope

Any feature. Any UI beyond the layout shell and a token preview page at
`/dev/tokens` (dev-only route, gated behind `NODE_ENV !== "production"`).

## Key files

```
package.json  tsconfig.json  next.config.ts  eslint.config.mjs
docker-compose.yml  .env.example  .github/workflows/ci.yml
prisma/schema.prisma  prisma/seed.ts
src/styles/tokens.css  src/app/layout.tsx  src/app/dev/tokens/page.tsx
src/server/storage/{client.ts,keys.ts,index.ts}
src/server/errors.ts  src/server/logger.ts  src/server/api/wrap.ts
worker/index.ts  worker/jobs/noop.ts
vitest.config.ts  playwright.config.ts
```

## Acceptance criteria

- [ ] `git clone && cp .env.example .env && docker compose --profile dev up -d
  && pnpm i && pnpm db:migrate && pnpm dev` yields a running app on a clean
      machine — verified in CI, not just locally.
- [ ] `/dev/tokens` renders every colour, type step, radius and elevation in
      both themes; toggling the theme shows no flash.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` all green.
- [ ] The ESLint rule fires on a deliberate `PrismaClient` import in
      `src/app/`.
- [ ] `pnpm worker:dev` consumes a `noop` job enqueued from a script.
- [ ] Uploading a file to MinIO through the storage adapter and reading it back
      via a signed URL passes as an integration test.
- [ ] A specimen of `à è é ì ò ù ç œ â ê î ô û ë ï ü` renders in both fonts on
      `/dev/tokens` — no tofu.
