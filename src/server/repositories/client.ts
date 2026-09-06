import { PrismaClient } from "@prisma/client";

/**
 * The Prisma client singleton.
 *
 * This file, and its siblings in this directory, are the ONLY places
 * `@prisma/client` may be imported (CLAUDE.md hard rule #1, enforced by the
 * `no-restricted-imports` rule in eslint.config.mjs). Services take
 * repositories as arguments; route handlers call services.
 *
 * The globalThis cache exists because Next's dev server re-evaluates modules
 * on every hot reload, and a fresh PrismaClient per reload exhausts the
 * connection pool within a few minutes.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
