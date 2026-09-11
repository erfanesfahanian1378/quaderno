// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyIntegrationEnv,
  databaseReachable,
} from "../../setup/integration";
import type { prisma as PrismaInstance } from "@/server/repositories/client";
import type * as leafRepository from "@/server/repositories/leaf";

type PrismaClient = typeof PrismaInstance;
type LeafRepository = typeof leafRepository;

/**
 * Running ingest twice.
 *
 * This is not hypothetical: pg-boss gives the ingest job three attempts, so
 * any crash after the pages are written replays this code. It used to throw
 * P2002 on the unique key over (documentId, position) and leave the document
 * FAILED — a file that had converted perfectly, reported as broken, with the
 * real cause three layers down in a worker log.
 *
 * The second test is the one that cost something. Making creation idempotent
 * by returning the existing count meant ingest then wrote THAT number into
 * `leafCount`, which silently dropped every note page the reader had added
 * since. A retry is meant to repair a document, not quietly shrink it.
 */
const EMAIL = "ingest-retry@test.local";

let available = false;
let prisma: PrismaClient;
let leaves: LeafRepository;

let documentId = "";
let sourceFileId = "";

function needsDatabase(context: { skip: () => void }): boolean {
  if (available) return true;
  context.skip();
  return false;
}

beforeAll(async () => {
  applyIntegrationEnv();
  available = await databaseReachable();
  if (!available) {
    console.warn("[skip] Postgres is not reachable");
    return;
  }

  ({ prisma } = await import("@/server/repositories/client"));
  leaves = await import("@/server/repositories/leaf");

  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Ingest", passwordHash: "x" },
    select: { id: true },
  });

  const language = await prisma.language.create({
    data: { userId: user.id, code: "it", name: "Italiano" },
    select: { id: true },
  });

  const document = await prisma.document.create({
    data: {
      userId: user.id,
      languageId: language.id,
      title: "Handout",
      origin: "UPLOAD" as never,
      status: "CONVERTING" as never,
    },
    select: { id: true },
  });
  documentId = document.id;

  const source = await prisma.sourceFile.create({
    data: {
      documentId: document.id,
      storageKey: "k",
      mimeType: "application/pdf",
      byteSize: 1,
      checksumSha256: "0".repeat(64),
      originalName: "handout.pdf",
    },
    select: { id: true },
  });
  sourceFileId = source.id;
});

afterAll(async () => {
  if (!available) return;
  await prisma.user.deleteMany({ where: { email: EMAIL } });
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

describe("ingest run twice", () => {
  it("creates the pages once and does not throw on a replay", async (context) => {
    if (!needsDatabase(context)) return;

    expect(await leaves.createSourcePages(documentId, sourceFileId, 3)).toBe(3);

    // The replay. This threw P2002 before, because positions are fixed 1..N.
    expect(await leaves.createSourcePages(documentId, sourceFileId, 3)).toBe(3);

    const total = await prisma.leaf.count({ where: { documentId } });
    expect(total, "a replay must not duplicate pages").toBe(3);
  });

  it("keeps note pages a replay knows nothing about", async (context) => {
    if (!needsDatabase(context)) return;

    await prisma.leaf.create({
      data: {
        documentId,
        kind: "NOTE_PAGE" as never,
        position: 99,
      },
    });

    await leaves.createSourcePages(documentId, sourceFileId, 3);
    const count = await leaves.recountLeaves(documentId);

    // Three source pages plus the note page. Counting only what ingest
    // created would report three and lose the reader's own page.
    expect(count).toBe(4);

    const stored = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { leafCount: true },
    });
    expect(stored.leafCount).toBe(4);
  });

  it("does not count hidden pages", async (context) => {
    if (!needsDatabase(context)) return;

    const first = await prisma.leaf.findFirstOrThrow({
      where: { documentId, kind: "SOURCE_PAGE" as never },
      select: { id: true },
    });
    await prisma.leaf.update({
      where: { id: first.id },
      data: { hidden: true },
    });

    // What the rest of the app means by a page count: listForDocument hides
    // these and the viewer never shows them.
    expect(await leaves.recountLeaves(documentId)).toBe(3);
  });
});
