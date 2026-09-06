import NextAuth, { type DefaultSession } from "next-auth";
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
   * this file — including any OAuth provider added later — is unaffected.
   */
  providers: [],

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
