import { prisma } from "./client";
import type { Ctx } from "./base";

/** Folders in the library. One tree per language. */

export type FolderRow = {
  id: string;
  languageId: string;
  parentId: string | null;
  name: string;
  position: number;
  createdAt: Date;
};

const FIELDS = {
  id: true,
  languageId: true,
  parentId: true,
  name: true,
  position: true,
  createdAt: true,
} as const;

/**
 * Every folder in a language, in one read.
 *
 * The whole tree rather than one level: a library has tens of folders, not
 * thousands, and having all of them lets the breadcrumb, the move-to menu and
 * the counts be built without a query per level.
 */
export async function listForLanguage(
  ctx: Ctx,
  languageId: string,
): Promise<FolderRow[]> {
  return prisma.folder.findMany({
    where: { userId: ctx.userId, languageId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: FIELDS,
  });
}

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<FolderRow | null> {
  return prisma.folder.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

export async function create(
  ctx: Ctx,
  input: { languageId: string; parentId: string | null; name: string },
): Promise<FolderRow> {
  const last = await prisma.folder.findFirst({
    where: {
      userId: ctx.userId,
      languageId: input.languageId,
      parentId: input.parentId,
    },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return prisma.folder.create({
    data: {
      userId: ctx.userId,
      languageId: input.languageId,
      parentId: input.parentId,
      name: input.name,
      position: (last?.position ?? -1) + 1,
    },
    select: FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: { name?: string | undefined; parentId?: string | null | undefined },
): Promise<FolderRow | null> {
  const result = await prisma.folder.updateMany({
    where: { id, userId: ctx.userId },
    data,
  });
  if (result.count === 0) return null;
  return findById(ctx, id);
}

/**
 * Delete a folder, keeping everything inside it.
 *
 * Children are reparented onto this folder's own parent and documents move up
 * with them, in one transaction, before the row goes. Losing a term's work to
 * a mis-tapped delete is not a recoverable mistake for the person it happens
 * to — and the foreign key is SET NULL rather than CASCADE so that even a
 * delete that bypasses this function cannot take a subtree with it.
 */
export async function removeKeepingContents(
  ctx: Ctx,
  id: string,
): Promise<{ movedFolders: number; movedDocuments: number } | null> {
  const folder = await findById(ctx, id);
  if (!folder) return null;

  const [children, docs] = await prisma.$transaction([
    prisma.folder.updateMany({
      where: { userId: ctx.userId, parentId: id },
      data: { parentId: folder.parentId },
    }),
    prisma.document.updateMany({
      where: { userId: ctx.userId, folderId: id },
      data: { folderId: folder.parentId },
    }),
  ]);

  await prisma.folder.deleteMany({ where: { id, userId: ctx.userId } });

  return { movedFolders: children.count, movedDocuments: docs.count };
}

/** How many documents sit directly in each folder. For the folder tiles. */
export async function documentCounts(
  ctx: Ctx,
  languageId: string,
): Promise<Record<string, number>> {
  const rows = await prisma.document.groupBy({
    by: ["folderId"],
    where: {
      userId: ctx.userId,
      languageId,
      deletedAt: null,
      folderId: { not: null },
    },
    _count: { _all: true },
  });

  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.folderId) out[row.folderId] = row._count._all;
  }
  return out;
}
