import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../repositories/client";
import * as users from "../repositories/user";
import { signInSchema } from "../validation/auth";
import { burnTimeLikeAVerify, verifyPassword } from "./password";
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
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) {
          // Still burn the time — a malformed body must not be measurably
          // faster than a wrong password.
          await burnTimeLikeAVerify();
          return null;
        }

        const user = await users.findByEmailWithHash(parsed.data.email);

        if (!user?.passwordHash) {
          // No such account, or an OAuth-only account. Same cost, same answer.
          await burnTimeLikeAVerify();
          return null;
        }

        const ok = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );
        if (!ok) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
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
