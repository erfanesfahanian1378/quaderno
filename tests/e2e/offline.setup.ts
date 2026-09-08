import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * A real signed-in account for the offline suite.
 *
 * Minted here rather than by signing in through the form: the suite is about
 * the service worker, and a login flow in front of every test is both slow and
 * an unrelated thing that can break.
 *
 * The token is handed to the tests through the environment. It is a real
 * session row, so every request in the suite is authenticated exactly as a
 * person's would be — which matters, because a suite that silently runs
 * signed out asserts nothing. That happened during development: the production
 * build names the cookie `__Secure-authjs.session-token` and setting the
 * development name made every page redirect to sign-in.
 */
const EMAIL = "e2e-offline@test.local";

export default async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.user.deleteMany({ where: { email: EMAIL } });

    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: "Offline E2E",
        passwordHash: "not-used",
        emailVerified: new Date(),
      },
      select: { id: true },
    });

    // A language, so /library and /review render something rather than the
    // "add a language first" empty state.
    await prisma.language.create({
      data: { userId: user.id, code: "it", name: "Italiano" },
    });

    const token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        sessionToken: token,
        userId: user.id,
        expires: new Date(Date.now() + 86_400_000),
      },
    });

    process.env.E2E_SESSION_TOKEN = token;
  } finally {
    await prisma.$disconnect();
  }
}
