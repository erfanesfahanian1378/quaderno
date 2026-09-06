import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * The reference repository. Every later repository copies this shape.
 *
 * Note which functions take `ctx` and which do not, because the distinction is
 * the whole rule:
 *
 *  - Functions that read or write **a user's own row** take `ctx` and scope on
 *    it. They can never touch another account.
 *  - `findByEmail` and `findByVerificationToken` are the deliberate
 *    exceptions: they run *before* there is a session, during sign-in and
 *    verification. They are the only unauthenticated reads in the system and
 *    they live here so they are easy to audit.
 */

const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  image: true,
  emailVerified: true,
  locale: true,
  timeZone: true,
  weekStartsOn: true,
  theme: true,
  storageQuotaBytes: true,
  storageUsedBytes: true,
  createdAt: true,
} as const;

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
  locale: string;
  timeZone: string;
  weekStartsOn: number;
  theme: string;
  storageQuotaBytes: bigint;
  storageUsedBytes: bigint;
  createdAt: Date;
};

/** Pre-session read. Returns the hash, so it must never reach a route response. */
export async function findByEmailWithHash(email: string) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    select: { id: true, email: true, passwordHash: true, emailVerified: true },
  });
}

export async function findById(ctx: Ctx): Promise<PublicUser | null> {
  return prisma.user.findFirst({
    where: { id: ctx.userId, deletedAt: null },
    select: PUBLIC_FIELDS,
  });
}

export async function create(input: {
  email: string;
  passwordHash: string;
  name?: string | undefined;
}): Promise<PublicUser> {
  return prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      name: input.name ?? null,
    },
    select: PUBLIC_FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  data: {
    name?: string | undefined;
    locale?: string | undefined;
    timeZone?: string | undefined;
    weekStartsOn?: number | undefined;
    theme?: string | undefined;
  },
): Promise<PublicUser | null> {
  // updateMany, not update: it takes a `where` we can scope, so a foreign id
  // updates zero rows instead of throwing a Prisma "record not found" that a
  // caller might map to the wrong status.
  const result = await prisma.user.updateMany({
    where: { id: ctx.userId, deletedAt: null },
    data,
  });
  if (result.count === 0) return null;
  return findById(ctx);
}

export async function setPasswordHash(
  ctx: Ctx,
  passwordHash: string,
): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { id: ctx.userId, deletedAt: null },
    data: { passwordHash },
  });
  return result.count > 0;
}

export async function markEmailVerified(ctx: Ctx): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { id: ctx.userId, deletedAt: null },
    data: { emailVerified: new Date() },
  });
  return result.count > 0;
}

/** Soft delete. The 7-day-delayed hard delete and blob purge is a job. */
export async function softDelete(ctx: Ctx): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { id: ctx.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

/** Storage accounting. Signed so a delete can give the space back. */
export async function addStorageUsed(ctx: Ctx, delta: bigint): Promise<void> {
  await prisma.user.updateMany({
    where: { id: ctx.userId },
    data: { storageUsedBytes: { increment: delta } },
  });
}

// --- Sessions ---------------------------------------------------------------

export async function listSessions(ctx: Ctx) {
  return prisma.session.findMany({
    where: { userId: ctx.userId },
    select: { id: true, expires: true },
    orderBy: { expires: "desc" },
  });
}

export async function revokeSession(
  ctx: Ctx,
  sessionId: string,
): Promise<boolean> {
  const result = await prisma.session.deleteMany({
    where: { id: sessionId, userId: ctx.userId },
  });
  return result.count > 0;
}

/** Used on password change and reset. `except` keeps the current session. */
export async function revokeAllSessions(
  ctx: Ctx,
  except?: string,
): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      userId: ctx.userId,
      ...(except ? { NOT: { sessionToken: except } } : {}),
    },
  });
  return result.count;
}

// --- Verification / reset tokens -------------------------------------------

export async function createVerificationToken(input: {
  identifier: string;
  token: string;
  expires: Date;
}) {
  return prisma.verificationToken.create({ data: input });
}

/** Single-use: the token is consumed as it is read. */
export async function consumeVerificationToken(token: string) {
  const row = await prisma.verificationToken.findUnique({ where: { token } });
  if (!row) return null;
  await prisma.verificationToken.delete({ where: { token } });
  if (row.expires < new Date()) return null;
  return row;
}
