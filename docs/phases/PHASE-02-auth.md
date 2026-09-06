# PHASE 02 — Auth & multi-tenancy

**Goal:** users can register, sign in, reset a password and delete their
account — and the tenancy rule that protects every later phase is in place and
tested.

**Prerequisites:** Phase 01.

## Scope

1. **Auth.js v5** with the Prisma adapter, database sessions, credentials
   provider. Optional Google provider behind an env flag.
2. **Password handling** — argon2id (`m=19456, t=2, p=1`). Registration
   validates with zxcvbn (min score 2) and rejects the 10k most common
   passwords. Never bcrypt.
3. **Flows** — register (with email verification token), sign in, sign out,
   forgot password (always 202, never reveals whether an address exists),
   reset (invalidates all sessions), change password from settings.
4. **Email** — a small `Mailer` interface with a console transport for dev and
   SMTP for production. Verification, reset and account-deletion notices.
5. **Session hardening** — `httpOnly` `SameSite=Lax` `Secure` cookies, 30-day
   sliding expiry, rotation on password change, an active-sessions list in
   settings with individual revoke.
6. **The repository layer.** Create `src/server/repositories/base.ts` with the
   `ctx: { userId }` convention and a `scoped()` helper, plus a `UserRepository`
   as the reference implementation. **Every later phase copies this shape.**
7. **`requireUser()`** guard for route handlers and Server Actions; middleware
   protecting `/(app)` routes with a redirect that preserves the intended URL.
8. **Rate limiting** — Postgres token bucket, applied to login, registration
   and password reset per `API.md`.
9. **Account lifecycle** — `GET/PATCH /api/me`, data export job (JSON + a zip
   of original files), delete account with password re-entry and a 7-day
   delayed hard delete that also drops the storage prefix.
10. **`AuditLog`** writes for login success/failure, password change, account
    deletion.
11. **UI** — sign in, sign up, forgot, reset, verify-email, and the Profile +
    Security sections of settings, built from the Phase 01 tokens and matching
    the design brief §5.1 and §5.13.

## Out of scope

Languages, documents, anything domain-specific. Two-factor auth (note it in
the roadmap).

## Key files

```
src/server/auth/{config.ts,password.ts,guards.ts,rate-limit.ts,mailer.ts}
src/server/repositories/{base.ts,user.ts}
src/app/(auth)/{sign-in,sign-up,forgot,reset,verify}/page.tsx
src/app/api/auth/[...nextauth]/route.ts
src/app/api/auth/register/route.ts
src/app/api/auth/password/{forgot,reset}/route.ts
src/app/api/me/route.ts
src/middleware.ts
tests/security/tenancy.spec.ts
```

## Acceptance criteria

- [ ] Register → verification email in the console → verify → sign in works
      end-to-end in a Playwright test.
- [ ] Six wrong passwords in 15 minutes returns 429 with `Retry-After`.
- [ ] `POST /api/auth/password/forgot` returns 202 in the same time
      (±50 ms) for an existing and a non-existing address — a timing test.
- [ ] Resetting a password invalidates every other session.
- [ ] `tests/security/tenancy.spec.ts` exists, enumerates every exported
      repository function via reflection, calls each with a foreign id, and
      asserts not-found. It fails loudly when a new unscoped repository
      function is added — this test is the guard rail for phases 03–09.
- [ ] Account deletion removes rows and the `u/{userId}/` storage prefix, and
      is verified by an integration test.
- [ ] No route under `/(app)` is reachable without a session.
