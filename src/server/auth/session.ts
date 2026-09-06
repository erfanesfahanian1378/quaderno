import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../repositories/client";

/**
 * Credential sign-in, issuing a **database** session directly.
 *
 * Why this exists rather than Auth.js's Credentials provider: Auth.js v5
 * refuses to combine `Credentials` with `strategy: "database"` and insists on
 * JWTs. But PHASE-02 requires that resetting a password invalidates every
 * other session, and a stateless JWT cannot be revoked — you would need a
 * denylist, which is a database lookup on every request, which is the thing
 * JWTs were supposed to avoid. So the trade is a bad one here.
 *
 * The session row and cookie below are exactly what `@auth/prisma-adapter`
 * writes and what `auth()` reads, so the rest of Auth.js — `auth()`, the
 * session callback, and any OAuth provider added later — keeps working
 * unchanged. This function replaces one provider, not the library.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Auth.js uses the __Secure- prefix once the cookie is marked secure. */
export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export async function createSession(userId: string): Promise<string> {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + THIRTY_DAYS_MS);

  await prisma.session.create({ data: { sessionToken, userId, expires } });

  const store = await cookies();
  store.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  return sessionToken;
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const name = sessionCookieName();
  const token = store.get(name)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { sessionToken: token } });
  }
  store.delete(name);
}

/**
 * Reads and validates the current session.
 *
 * This does the job `auth()` would, and it exists for the same reason
 * `createSession` does: with no providers configured, Auth.js's `auth()`
 * returns nothing, and configuring a Credentials provider is exactly what
 * forces the JWT strategy we cannot use. Reading the session ourselves is one
 * indexed lookup and removes the coupling entirely.
 *
 * Auth.js remains in the project for OAuth providers, which do work with the
 * database strategy; it simply is not on the password path.
 */
export async function getSession(): Promise<{
  userId: string;
  sessionToken: string;
} | null> {
  const store = await cookies();
  const sessionToken = store.get(sessionCookieName())?.value;
  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: {
      expires: true,
      userId: true,
      user: { select: { deletedAt: true } },
    },
  });

  if (!session) return null;

  // An expired row is deleted rather than left to rot; the Session table is
  // also the revocation list, and a stale row there is a liability.
  if (session.expires < new Date()) {
    await prisma.session.deleteMany({ where: { sessionToken } });
    return null;
  }

  // A soft-deleted account must not be able to keep using an old session.
  if (session.user.deletedAt) return null;

  // Sliding expiry: extend at most once a day, so a daily user never gets
  // logged out, and one write does not happen on every request.
  const remaining = session.expires.getTime() - Date.now();
  if (remaining < THIRTY_DAYS_MS - 24 * 60 * 60 * 1000) {
    await prisma.session.update({
      where: { sessionToken },
      data: { expires: new Date(Date.now() + THIRTY_DAYS_MS) },
    });
  }

  return { userId: session.userId, sessionToken };
}

/** The token of the session making this request, so a reset can spare it. */
export async function currentSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(sessionCookieName())?.value;
}
