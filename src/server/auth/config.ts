import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../repositories/client";
import { logger } from "../logger";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

/**
 * Auth.js v5 with **database sessions**, not JWTs.
 *
 * The trade is deliberate: a database session costs one indexed lookup per
 * request, and buys the ability to revoke a session instantly. PHASE-02
 * requires "resetting a password invalidates every other session", which a
 * stateless JWT simply cannot do without a denylist — i.e. without a database
 * lookup anyway.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // sliding: refresh at most once a day
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
    verifyRequest: "/verify",
  },
  trustHost: true,
  /*
   * No Credentials provider here on purpose. Auth.js v5 refuses to combine
   * `Credentials` with `strategy: "database"` and demands JWTs, but PHASE-02
   * requires revocable sessions (a password reset must invalidate every other
   * session), which a stateless token cannot give us.
   *
   * Password sign-in therefore issues a database session directly in
   * `src/server/auth/session.ts`, writing exactly the row and cookie the
   * Prisma adapter would. `auth()` below still reads it, so everything else in
   * this file — Google below included — is unaffected.
   */
  providers: googleProvider(),

  callbacks: {
    session({ session, user }) {
      // The adapter gives us the user row; surface only the id.
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    signIn({ user }) {
      logger.info({ userId: user.id }, "auth.login.success");
    },
    signOut() {
      logger.info("auth.logout");
    },
  },
});

/**
 * Google, when it is configured, and silently absent when it is not.
 *
 * Returning an empty list rather than a half-built provider matters: the app
 * has to run with no Google credentials at all — that is how it runs locally,
 * and how it ran for every phase before this one. A provider missing its
 * secret does not fail at boot, it fails at the redirect, after the person has
 * already left for Google and come back.
 *
 * **`allowDangerousEmailAccountLinking` is on, and only safe because this is
 * Google.** It links a Google sign-in to an existing account with the same
 * address, which is what someone who signed up with a password and later taps
 * "Continue with Google" expects — without it Auth.js refuses with
 * OAuthAccountNotLinked and there is no way forward from the screen. The flag
 * is called dangerous because a provider that does NOT verify email addresses
 * would let anyone claim an account by asserting its address. Google verifies
 * them. Do not copy this flag onto a provider that does not.
 */
function googleProvider() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) return [];

  return [
    Google({
      clientId,
      clientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  ];
}

/** Whether the button should be shown at all. */
export function googleEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}
