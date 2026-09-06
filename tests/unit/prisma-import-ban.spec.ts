// @vitest-environment node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ESLint } from "eslint";

/**
 * CLAUDE.md hard rule #1 — "a PrismaClient import anywhere else is a review
 * rejection" — as a test, so it is a *build* rejection and no reviewer has to
 * remember it. PHASE-01 asks for the rule to be verified by firing it on a
 * deliberate import in `src/app/`.
 *
 * The probe files are written to real paths and deleted afterwards rather
 * than linted as virtual text: typed linting resolves each file through the
 * TypeScript project service, and a path that does not exist on disk yields a
 * parse error instead of the rule result we are asserting on. Real files also
 * mean this test exercises the exact config the repo ships.
 */

const ROOT = join(__dirname, "..", "..");
const OFFENDING = `import { PrismaClient } from "@prisma/client";\nexport const client = new PrismaClient();\n`;

const written: string[] = [];

afterEach(() => {
  while (written.length > 0) {
    const path = written.pop();
    if (path) rmSync(path, { force: true });
  }
});

async function lintProbe(relativePath: string, code: string) {
  const absolute = join(ROOT, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, code);
  written.push(absolute);

  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintFiles([absolute]);

  const messages = result?.messages ?? [];
  // A parse error would silently pass every "allows" assertion below.
  const fatal = messages.filter((message) => message.fatal);
  expect(fatal, `parse error in probe ${relativePath}`).toHaveLength(0);

  return messages;
}

const isBan = (message: { ruleId?: string | null }) =>
  message.ruleId === "no-restricted-imports";

describe("the Prisma import ban", () => {
  it.each([
    ["a route handler", "src/app/api/__probe__/route.ts"],
    ["a page", "src/app/__probe__/page.tsx"],
    ["a service", "src/server/services/__probe__.ts"],
    ["a component", "src/components/__probe__.tsx"],
    ["a lib helper", "src/lib/__probe__.ts"],
  ])("fires in %s", async (_label, path) => {
    const banned = (await lintProbe(path, OFFENDING)).filter(isBan);

    expect(banned.length).toBeGreaterThan(0);
    expect(banned[0]?.message).toMatch(/src\/server\/repositories/);
  });

  it.each([
    ["the repository layer", "src/server/repositories/__probe__.ts"],
    ["the seed script", "prisma/__probe__.ts"],
    ["the worker", "worker/jobs/__probe__.ts"],
    ["a test", "tests/security/__probe__.spec.ts"],
  ])("allows %s", async (_label, path) => {
    expect((await lintProbe(path, OFFENDING)).filter(isBan)).toHaveLength(0);
  });

  it("also catches a deep import that dodges the bare specifier", async () => {
    const banned = (
      await lintProbe(
        "src/app/api/__probe__/deep.ts",
        `import type { Prisma } from "@prisma/client/runtime/library";\nexport type X = Prisma.JsonValue;\n`,
      )
    ).filter(isBan);

    expect(banned.length).toBeGreaterThan(0);
  });
});
