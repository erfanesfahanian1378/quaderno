// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyIntegrationEnv,
  databaseReachable,
} from "../../setup/integration";
import type { prisma as PrismaInstance } from "@/server/repositories/client";
import type * as documentRepository from "@/server/repositories/document";

type PrismaClient = typeof PrismaInstance;
type DocumentRepository = typeof documentRepository;

/**
 * Delete, and the way back.
 *
 * `softDelete` and `restore` both existed and only one of them could be
 * reached, so a "30-day trash" was a column nobody could act on. These tests
 * cover the pair as one round trip, because that is the only shape in which
 * either is worth anything — and the listing filter that decides which of the
 * two lists a document appears in, which fails SILENTLY if it is wrong: a
 * deleted document quietly showing in the library, or a live one vanishing
 * into the trash, both look like data loss rather than a bad `where`.
 */
const EMAIL = "trash@test.local";

let available = false;
let prisma: PrismaClient;
let repo: DocumentRepository;

let ctx = { userId: "" };
let languageId = "";
let otherUser = { userId: "" };

beforeAll(async () => {
  applyIntegrationEnv();
  available = await databaseReachable();
  if (!available) {
    console.warn("[skip] Postgres is not reachable");
    return;
  }

  ({ prisma } = await import("@/server/repositories/client"));
  repo = await import("@/server/repositories/document");

  await prisma.user.deleteMany({
    where: { email: { in: [EMAIL, `other-${EMAIL}`] } },
  });

  const [user, other] = await Promise.all([
    prisma.user.create({
      data: { email: EMAIL, name: "Trash", passwordHash: "x" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: `other-${EMAIL}`, name: "Other", passwordHash: "x" },
      select: { id: true },
    }),
  ]);

  ctx = { userId: user.id };
  otherUser = { userId: other.id };

  const language = await prisma.language.create({
    data: { userId: user.id, code: "it", name: "Italiano" },
    select: { id: true },
  });
  languageId = language.id;
});

afterAll(async () => {
  if (!available) return;
  await prisma.user.deleteMany({
    where: { email: { in: [EMAIL, `other-${EMAIL}`] } },
  });
  /*
   * Disconnect, and it matters more than it looks.
   *
   * Vitest gives each spec file its own module registry and therefore its own
   * Prisma client, and `DATABASE_URL` carries connection_limit=8. Three
   * integration files that do not release their pools, alongside a dev server
   * and a worker, exhaust Postgres — and the symptom is not an error in the
   * file that caused it: `databaseReachable()` starts returning false and
   * later specs SKIP, which reads as green.
   */
  await prisma.$disconnect();
});

/**
 * Skip at RUN time, not at collection time.
 *
 * `it.skipIf(!available)` reads `available` while the tests are being
 * defined, which is before `beforeAll` has had a chance to set it — so every
 * test skipped, the file reported six passes-that-were-not, and the suite
 * looked green while asserting nothing.
 */
function needsDatabase(context: { skip: () => void }): boolean {
  if (available) return true;
  context.skip();
  return false;
}

const make = (title: string) =>
  repo.create(ctx, { languageId, title, origin: "UPLOAD", status: "READY" });

const titles = async (deleted?: boolean) => {
  const page = await repo.list(ctx, deleted === undefined ? {} : { deleted }, {
    limit: 50,
  });
  return page.items.map((item) => item.title).sort();
};

describe("the trash", () => {
  it("moves a document out of the library and into it", async (context) => {
    if (!needsDatabase(context)) return;

    const doc = await make("Lezione 1");
    expect(await titles()).toContain("Lezione 1");

    expect(await repo.softDelete(ctx, doc.id)).toBe(true);

    // The two listings are complements, and this is the assertion that a
    // wrong `where` clause fails on.
    expect(await titles()).not.toContain("Lezione 1");
    expect(await titles(true)).toContain("Lezione 1");
  });

  it("puts it back where it was", async (context) => {
    if (!needsDatabase(context)) return;

    const doc = await make("Lezione 2");
    await repo.softDelete(ctx, doc.id);

    expect(await repo.restore(ctx, doc.id)).toBe(true);

    expect(await titles()).toContain("Lezione 2");
    expect(await titles(true)).not.toContain("Lezione 2");
  });

  it("refuses to delete the same document twice", async (context) => {
    if (!needsDatabase(context)) return;

    const doc = await make("Lezione 3");
    expect(await repo.softDelete(ctx, doc.id)).toBe(true);

    // Not an error, but not a success either: the second caller must be able
    // to tell that it did nothing, or the route would answer 204 for a
    // document it never touched.
    expect(await repo.softDelete(ctx, doc.id)).toBe(false);
  });

  it("will not restore something that was never deleted", async (context) => {
    if (!needsDatabase(context)) return;

    const doc = await make("Lezione 4");
    expect(await repo.restore(ctx, doc.id)).toBe(false);
  });

  it("will not let one account delete another's document", async (context) => {
    if (!needsDatabase(context)) return;

    const doc = await make("Lezione 5");

    expect(await repo.softDelete(otherUser, doc.id)).toBe(false);
    expect(await titles()).toContain("Lezione 5");
  });

  it("will not let one account restore another's document", async (context) => {
    if (!needsDatabase(context)) return;

    const doc = await make("Lezione 6");
    await repo.softDelete(ctx, doc.id);

    expect(await repo.restore(otherUser, doc.id)).toBe(false);
    expect(await titles(true)).toContain("Lezione 6");
  });
});
