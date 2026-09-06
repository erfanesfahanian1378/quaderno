// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { applyIntegrationEnv, databaseReachable } from "../setup/integration";

/**
 * The tenancy guard rail. PHASE-02 acceptance criteria.
 *
 *   "enumerates every exported repository function via reflection, calls each
 *    with a foreign id, and asserts not-found. It fails loudly when a new
 *    unscoped repository function is added — this test is the guard rail for
 *    phases 03–09."
 *
 * Reflection rather than a hand-written list is the whole point. A list rots:
 * someone adds `findByShareToken` in six months, forgets to scope it, and no
 * hand-written test knows to check. This walks the module and forces every
 * exported function to justify itself.
 *
 * IDOR is the top risk in this app (ARCHITECTURE.md §7) — documents are just
 * ids — and the repository layer's mandatory `userId` scoping is the only
 * control. This test is what proves the control is still there.
 */

const REPOSITORY_MODULES = [
  "annotation",
  "class-session",
  "comment",
  "course",
  "document",
  "language",
  "leaf",
  "note-page",
  "search",
  "source-file",
  "study",
  "user",
] as const;

/**
 * Functions that legitimately take no `ctx`, each with the reason it is safe.
 * Adding a name here is a deliberate act that a reviewer can question.
 */
const UNSCOPED_BY_DESIGN: Record<string, string> = {
  // Pre-session reads: sign-in and email verification happen before a session
  // exists. These are the only unauthenticated reads in the system.
  "user.findByEmailWithHash": "pre-session: sign-in",
  "user.createVerificationToken": "pre-session: verification",
  "user.consumeVerificationToken": "pre-session: verification",
  "user.create": "registration creates the user being scoped to",

  // Worker-side writes. The job established ownership when it was enqueued,
  // and the worker is not serving a request.
  "document.setStatus": "worker: ingest",
  "document.setThumbnailKey": "worker: ingest",
  "document.ownerOf": "worker: resolves the owner, does not read their data",
  "source-file.create": "worker: ingest",
  "source-file.recordConversion": "worker: ingest",
  "source-file.recordStorageKey": "worker: ingest",
  "source-file.recordChecksum": "worker: ingest",
  "source-file.appendLog": "worker: ingest",
  "source-file.markOcrApplied": "worker: ocr",
  "source-file.forJob": "worker: ingest",
  "source-file.findByChecksumForUser": "takes an explicit userId argument",
  "leaf.createSourcePages": "worker: ingest",
  "leaf.setLeafCount": "worker: ingest",
  "leaf.firstLeafId": "worker: ingest",
  "study.closeStaleTimers": "worker: the reaper sweeps every user by design",
};

let available = false;

beforeAll(async () => {
  applyIntegrationEnv();
  available = await databaseReachable();
  if (!available) {
    console.warn(
      "[skip] Postgres is not reachable — run `docker compose --profile dev up -d`",
    );
  }
});

describe("every repository function is tenant-scoped", () => {
  it.each(REPOSITORY_MODULES)(
    "%s: every exported function takes ctx, or is listed as unscoped by design",
    async (moduleName) => {
      const repository = (await import(
        `@/server/repositories/${moduleName}`
      )) as Record<string, unknown>;

      const unscoped: string[] = [];

      for (const [name, value] of Object.entries(repository)) {
        if (typeof value !== "function") continue;
        if (name.startsWith("__")) continue;

        const qualified = `${moduleName}.${name}`;
        if (qualified in UNSCOPED_BY_DESIGN) continue;

        // The convention is that `ctx` is the FIRST parameter. Reading the
        // source is crude but it is what makes this reflective rather than a
        // list someone has to remember to update.
        const source = value.toString();
        const params = source.slice(
          source.indexOf("(") + 1,
          source.indexOf(")"),
        );
        const first = params.split(",")[0]?.trim() ?? "";

        if (!first.startsWith("ctx")) unscoped.push(qualified);
      }

      expect(
        unscoped,
        `These repository functions do not take ctx as their first argument. ` +
          `Either scope them, or add them to UNSCOPED_BY_DESIGN in this file ` +
          `with the reason they are safe:\n  ${unscoped.join("\n  ")}`,
      ).toEqual([]);
    },
  );
});

describe("a foreign id is not found", () => {
  /**
   * The behavioural half. Reflection proves the SHAPE is right; this proves
   * the shape is actually load-bearing — that a scoped call with someone
   * else's id really does come back empty rather than returning their row.
   */
  it("returns nothing for every scoped read with a foreign id", async () => {
    if (!available) return;

    /*
     * The SHARED client, not a new one.
     *
     * ARCHITECTURE.md §6 caps Postgres at max_connections=20 and the app's
     * pool at 8. A second PrismaClient here opens a second pool of 8, and
     * with a dev server and a worker also connected that tips the database
     * over with "sorry, too many clients already" — which looks like a test
     * failure but is really the connection budget doing its job.
     */
    const { prisma } = await import("@/server/repositories/client");

    const stamp = Date.now();
    const owner = await prisma.user.create({
      data: { email: `owner-${stamp}@tenancy.test` },
      select: { id: true },
    });
    const intruder = await prisma.user.create({
      data: { email: `intruder-${stamp}@tenancy.test` },
      select: { id: true },
    });

    try {
      // Give the owner a full object graph.
      const language = await prisma.language.create({
        data: { userId: owner.id, code: "it", name: "Italiano" },
        select: { id: true },
      });
      const course = await prisma.course.create({
        data: {
          userId: owner.id,
          languageId: language.id,
          name: "Self-study",
          isDefault: true,
        },
        select: { id: true },
      });
      const classSession = await prisma.classSession.create({
        data: {
          userId: owner.id,
          languageId: language.id,
          date: new Date("2026-03-12"),
          title: "Lezione 12",
        },
        select: { id: true },
      });
      const document = await prisma.document.create({
        data: {
          userId: owner.id,
          languageId: language.id,
          title: "Handout",
          origin: "UPLOAD",
          status: "READY",
        },
        select: { id: true },
      });
      const notePage = await prisma.notePage.create({
        data: { content: "segreto" },
        select: { id: true },
      });
      const leaf = await prisma.leaf.create({
        data: {
          documentId: document.id,
          kind: "NOTE_PAGE",
          notePageId: notePage.id,
          position: 1,
        },
        select: { id: true },
      });
      const annotation = await prisma.annotation.create({
        data: {
          userId: owner.id,
          documentId: document.id,
          leafId: leaf.id,
          kind: "HIGHLIGHT",
          geometry: { quads: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.02 }] },
          clientId: `tenancy-${stamp}`,
          quotedText: "segreto",
        },
        select: { id: true, clientId: true },
      });
      await prisma.comment.create({
        data: {
          userId: owner.id,
          documentId: document.id,
          body: "un commento privato",
        },
      });

      const asIntruder = { userId: intruder.id };

      const languages = await import("@/server/repositories/language");
      const courses = await import("@/server/repositories/course");
      const classSessions = await import("@/server/repositories/class-session");
      const documents = await import("@/server/repositories/document");
      const leaves = await import("@/server/repositories/leaf");
      const notePages = await import("@/server/repositories/note-page");
      const annotations = await import("@/server/repositories/annotation");
      const comments = await import("@/server/repositories/comment");
      const search = await import("@/server/repositories/search");
      const sourceFiles = await import("@/server/repositories/source-file");

      // Reads: every one must come back empty.
      expect(await languages.findById(asIntruder, language.id)).toBeNull();
      expect(await courses.findById(asIntruder, course.id)).toBeNull();
      expect(
        await classSessions.findById(asIntruder, classSession.id),
      ).toBeNull();
      expect(await documents.findById(asIntruder, document.id)).toBeNull();
      expect(await documents.findFull(asIntruder, document.id)).toBeNull();
      expect(await leaves.findById(asIntruder, leaf.id)).toBeNull();
      expect(await notePages.findById(asIntruder, notePage.id)).toBeNull();
      expect(
        await annotations.findByClientId(asIntruder, annotation.clientId),
      ).toBeNull();

      // List reads must not leak either.
      expect(await languages.list(asIntruder)).toEqual([]);
      expect(await courses.listForLanguage(asIntruder, language.id)).toEqual(
        [],
      );
      expect(await leaves.listForDocument(asIntruder, document.id)).toEqual([]);
      expect(
        await annotations.listForDocument(asIntruder, document.id),
      ).toEqual([]);
      expect(await comments.listForDocument(asIntruder, document.id)).toEqual(
        [],
      );
      expect(
        await sourceFiles.findForDocument(asIntruder, document.id),
      ).toEqual([]);

      // Search must not surface another user's content, accents or not.
      expect(await search.search(asIntruder, "segreto")).toEqual([]);
      expect(await search.search(asIntruder, "commento")).toEqual([]);

      // Writes must affect zero rows rather than someone else's.
      expect(
        await languages.update(asIntruder, language.id, { name: "Pwned" }),
      ).toBeNull();
      expect(
        await documents.update(asIntruder, document.id, { title: "Pwned" }),
      ).toBeNull();
      expect(await documents.softDelete(asIntruder, document.id)).toBe(false);
      expect(await leaves.update(asIntruder, leaf.id, { hidden: true })).toBe(
        false,
      );
      expect(await leaves.hide(asIntruder, leaf.id)).toBe(false);
      expect(
        await notePages.update(asIntruder, notePage.id, { content: "pwned" }),
      ).toBeNull();
      expect(
        await annotations.softDeleteByClientId(asIntruder, annotation.clientId),
      ).toBeNull();

      // And the owner's data is genuinely untouched afterwards.
      const after = await prisma.document.findUnique({
        where: { id: document.id },
        select: { title: true, deletedAt: true },
      });
      expect(after?.title).toBe("Handout");
      expect(after?.deletedAt).toBeNull();

      const noteAfter = await prisma.notePage.findUnique({
        where: { id: notePage.id },
        select: { content: true },
      });
      expect(noteAfter?.content).toBe("segreto");
    } finally {
      // Cascades clean up everything hanging off these two users. The client
      // is shared, so it is deliberately NOT disconnected here.
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, intruder.id] } },
      });
    }
  });
});
