// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A guard on the one thing in this schema that Prisma cannot see.
 *
 * `Document.searchText` and its four siblings are Postgres GENERATED columns,
 * created in 20260907010000_search with a pg_trgm GIN index over each. Prisma
 * has no syntax for a generation expression, so before they were declared in
 * schema.prisma every `migrate dev` cheerfully offered to DROP them — which
 * would have deleted search without a single test failing.
 *
 * They are declared now, with `@ignore`. This test is the backstop for the
 * day someone removes that declaration and accepts the generated migration
 * without reading it.
 */
const MIGRATIONS = fileURLToPath(
  new URL("../../prisma/migrations", import.meta.url),
);

const GENERATED_COLUMNS = ["searchText"];

describe("migrations never drop a generated column", () => {
  const directories = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it("finds the migration directory", () => {
    expect(directories.length).toBeGreaterThan(0);
  });

  it.each(directories)("%s", (name) => {
    const sql = readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8");

    // Comments explain why these statements were removed by hand; they are
    // not statements, so they must not fail the test.
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    for (const column of GENERATED_COLUMNS) {
      expect(
        statements,
        `${name} drops the generated column "${column}". Prisma emits this ` +
          `when the column is missing from schema.prisma. Restore the ` +
          `declaration rather than accepting the migration — applying it ` +
          `deletes search.`,
      ).not.toMatch(new RegExp(`DROP\\s+COLUMN\\s+"?${column}"?`, "i"));
    }
  });
});
