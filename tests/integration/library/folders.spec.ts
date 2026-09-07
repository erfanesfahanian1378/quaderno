// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyIntegrationEnv,
  databaseReachable,
} from "../../setup/integration";
import type { prisma as PrismaInstance } from "@/server/repositories/client";
import type * as folderService from "@/server/services/library/folders";
import type * as folderRepository from "@/server/repositories/folder";

type PrismaClient = typeof PrismaInstance;
type FolderService = typeof folderService;
type FolderRepository = typeof folderRepository;

/**
 * The folder tree's invariants.
 *
 * Both of the rules tested here fail SILENTLY when they are missing — the
 * rows stay valid, nothing errors, and a subtree of someone's work simply
 * stops appearing in the library. That is why they get an integration test
 * rather than trust.
 */
const EMAIL = "folders@test.local";

let available = false;
let prisma: PrismaClient;
let service: FolderService;
let repo: FolderRepository;

let ctx = { userId: "" };
let languageId = "";
let otherLanguageId = "";

beforeAll(async () => {
  applyIntegrationEnv();
  available = await databaseReachable();
  if (!available) {
    console.warn("[skip] Postgres is not reachable");
    return;
  }

  ({ prisma } = await import("@/server/repositories/client"));
  service = await import("@/server/services/library/folders");
  repo = await import("@/server/repositories/folder");

  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Folders", passwordHash: "x" },
    select: { id: true },
  });
  ctx = { userId: user.id };

  const [italian, french] = await Promise.all([
    prisma.language.create({
      data: { userId: user.id, code: "it", name: "Italiano" },
      select: { id: true },
    }),
    prisma.language.create({
      data: { userId: user.id, code: "fr", name: "Francais" },
      select: { id: true },
    }),
  ]);
  languageId = italian.id;
  otherLanguageId = french.id;
});

afterAll(async () => {
  if (!available) return;
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

const make = (name: string, parentId: string | null = null) =>
  service.createFolder(ctx, { languageId, parentId, name });

describe("the folder tree", () => {
  it("nests folders and reads them back as a tree", async () => {
    if (!available) return;

    const term = await make("Term 1");
    const grammar = await make("Grammar", term.id);
    await make("Verbs", grammar.id);

    const { roots, byId } = await service.tree(ctx, languageId);
    expect(roots.map((node) => node.name)).toEqual(["Term 1"]);
    expect(roots[0]?.children[0]?.name).toBe("Grammar");
    expect(roots[0]?.children[0]?.children[0]?.name).toBe("Verbs");

    const deepest = roots[0]!.children[0]!.children[0]!;
    expect(service.pathTo(byId, deepest.id).map((node) => node.name)).toEqual([
      "Term 1",
      "Grammar",
      "Verbs",
    ]);
  });

  it("refuses to move a folder into itself", async () => {
    if (!available) return;

    const { byId } = await service.tree(ctx, languageId);
    const term = [...byId.values()].find((node) => node.name === "Term 1")!;

    await expect(service.moveFolder(ctx, term.id, term.id)).rejects.toThrow(
      /inside itself/i,
    );
  });

  it("refuses to move a folder into its own descendant", async () => {
    if (!available) return;

    /*
     * The bug this prevents: Term 1 becomes a child of Verbs, which is a
     * child of Term 1. Every row stays valid, nothing errors, and Term 1 with
     * everything under it vanishes from the library.
     */
    const { byId } = await service.tree(ctx, languageId);
    const term = [...byId.values()].find((node) => node.name === "Term 1")!;
    const verbs = [...byId.values()].find((node) => node.name === "Verbs")!;

    await expect(service.moveFolder(ctx, term.id, verbs.id)).rejects.toThrow(
      /own folders/i,
    );

    const after = await service.tree(ctx, languageId);
    expect(after.roots.map((node) => node.name)).toEqual(["Term 1"]);
  });

  it("allows a legitimate move", async () => {
    if (!available) return;

    const loose = await make("Loose");
    const { byId } = await service.tree(ctx, languageId);
    const term = [...byId.values()].find((node) => node.name === "Term 1")!;

    await service.moveFolder(ctx, loose.id, term.id);

    const after = await service.tree(ctx, languageId);
    expect(after.byId.get(loose.id)?.parentId).toBe(term.id);
  });

  it("stops nesting at the depth limit", async () => {
    if (!available) return;

    let parent: string | null = null;
    for (let level = 0; level < service.MAX_DEPTH; level += 1) {
      parent = (await make(`Deep ${level}`, parent)).id;
    }

    await expect(make("Too deep", parent)).rejects.toThrow(/levels deep/i);
  });

  it("does not accept a parent from another language", async () => {
    if (!available) return;

    const foreign = await service.createFolder(ctx, {
      languageId: otherLanguageId,
      parentId: null,
      name: "French root",
    });

    await expect(
      service.createFolder(ctx, {
        languageId,
        parentId: foreign.id,
        name: "Wrong language",
      }),
    ).rejects.toThrow();
  });

  it("does not accept another user's folder as a parent", async () => {
    if (!available) return;

    const stranger = await prisma.user.create({
      data: { email: `x-${EMAIL}`, name: "X", passwordHash: "x" },
      select: { id: true },
    });
    const strangerLanguage = await prisma.language.create({
      data: { userId: stranger.id, code: "de", name: "Deutsch" },
      select: { id: true },
    });
    const strangerFolder = await service.createFolder(
      { userId: stranger.id },
      { languageId: strangerLanguage.id, parentId: null, name: "Theirs" },
    );

    await expect(
      service.createFolder(ctx, {
        languageId,
        parentId: strangerFolder.id,
        name: "Mine",
      }),
    ).rejects.toThrow();

    await prisma.user.deleteMany({ where: { id: stranger.id } });
  });

  it("deleting a folder keeps everything inside it", async () => {
    if (!available) return;

    const outer = await make("Outer");
    const inner = await make("Inner", outer.id);

    const document = await prisma.document.create({
      data: {
        userId: ctx.userId,
        languageId,
        title: "A handout",
        origin: "UPLOAD",
        status: "READY",
        folderId: outer.id,
      },
      select: { id: true },
    });

    const result = await service.deleteFolder(ctx, outer.id);
    expect(result).toEqual({ movedFolders: 1, movedDocuments: 1 });

    // Both moved up to where the deleted folder was — the top level here.
    expect((await repo.findById(ctx, inner.id))?.parentId).toBeNull();

    const moved = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      select: { folderId: true },
    });
    expect(moved.folderId).toBeNull();

    expect(await repo.findById(ctx, outer.id)).toBeNull();
  });

  it("renames", async () => {
    if (!available) return;

    const folder = await make("Typpo");
    expect((await service.renameFolder(ctx, folder.id, "Typo")).name).toBe(
      "Typo",
    );
  });

  it("cannot rename or delete someone else's folder", async () => {
    if (!available) return;

    const folder = await make("Mine only");

    await expect(
      service.renameFolder({ userId: "someone-else" }, folder.id, "Hijacked"),
    ).rejects.toThrow();
    await expect(
      service.deleteFolder({ userId: "someone-else" }, folder.id),
    ).rejects.toThrow();

    expect((await repo.findById(ctx, folder.id))?.name).toBe("Mine only");
  });
});
