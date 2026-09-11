import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * Leaf: an ordered page slot. A document is an ORDERED LIST OF LEAVES
 * (DATA_MODEL.md §1) — that is what lets a user drop their own note page
 * between pages 3 and 4 of the teacher's handout without touching the
 * uploaded file.
 *
 * `position` is a fractional index stored as Decimal(30,15). Inserting between
 * two leaves is the average of their neighbours, so a reorder is one row
 * update rather than a renumber of the whole document.
 */

export type LeafRow = {
  id: string;
  documentId: string;
  position: string;
  kind: "SOURCE_PAGE" | "NOTE_PAGE";
  sourceFileId: string | null;
  sourcePageIndex: number | null;
  notePageId: string | null;
  label: string | null;
  rotation: number;
  hidden: boolean;
};

const FIELDS = {
  id: true,
  documentId: true,
  position: true,
  kind: true,
  sourceFileId: true,
  sourcePageIndex: true,
  notePageId: true,
  label: true,
  rotation: true,
  hidden: true,
} as const;

function serialise(row: {
  position: unknown;
  [key: string]: unknown;
}): LeafRow {
  return { ...row, position: String(row.position) } as LeafRow;
}

export async function listForDocument(
  ctx: Ctx,
  documentId: string,
  includeHidden = false,
): Promise<LeafRow[]> {
  const rows = await prisma.leaf.findMany({
    where: {
      documentId,
      document: { userId: ctx.userId },
      ...(includeHidden ? {} : { hidden: false }),
    },
    select: FIELDS,
    orderBy: { position: "asc" },
  });
  return rows.map(serialise);
}

export async function findById(ctx: Ctx, id: string): Promise<LeafRow | null> {
  const row = await prisma.leaf.findFirst({
    where: { id, document: { userId: ctx.userId } },
    select: FIELDS,
  });
  return row ? serialise(row) : null;
}

/** Neighbours of a leaf, for computing a fractional index between them. */
export async function neighbours(
  ctx: Ctx,
  documentId: string,
  afterLeafId: string | null,
): Promise<{ prev: string | null; next: string | null }> {
  if (afterLeafId === null) {
    const first = await prisma.leaf.findFirst({
      where: { documentId, document: { userId: ctx.userId } },
      select: { position: true },
      orderBy: { position: "asc" },
    });
    return { prev: null, next: first ? String(first.position) : null };
  }

  const anchor = await prisma.leaf.findFirst({
    where: { id: afterLeafId, documentId, document: { userId: ctx.userId } },
    select: { position: true },
  });
  if (!anchor) return { prev: null, next: null };

  const next = await prisma.leaf.findFirst({
    where: {
      documentId,
      document: { userId: ctx.userId },
      position: { gt: anchor.position },
    },
    select: { position: true },
    orderBy: { position: "asc" },
  });

  return {
    prev: String(anchor.position),
    next: next ? String(next.position) : null,
  };
}

/**
 * Bulk create, used by ingest: one SOURCE_PAGE leaf per PDF page.
 *
 * **Idempotent, and it has to be.** Positions are fixed at 1..N, so running
 * this twice against the same document violates the unique key on
 * (documentId, position) — and ingest is retried: pg-boss gives it three
 * attempts, and a person can ask for a retry when a conversion has stalled.
 * Before this returned early, the second attempt failed with P2002 and left
 * the document FAILED, which looks like a broken file rather than a job that
 * had in fact already done this part.
 *
 * Existing pages are LEFT ALONE rather than replaced. Deleting and recreating
 * them would cascade to every annotation on them — a retry is meant to
 * recover a document, not to quietly wipe someone's highlights off it.
 */
export async function createSourcePages(
  documentId: string,
  sourceFileId: string,
  pageCount: number,
): Promise<number> {
  const existing = await prisma.leaf.count({
    where: { documentId, kind: "SOURCE_PAGE" as const },
  });
  if (existing > 0) return existing;

  const result = await prisma.leaf.createMany({
    data: Array.from({ length: pageCount }, (_, index) => ({
      documentId,
      sourceFileId,
      sourcePageIndex: index,
      kind: "SOURCE_PAGE" as const,
      // 1.0, 2.0, 3.0 … leaving room to insert between any two.
      position: index + 1,
    })),
  });
  return result.count;
}

export async function createNotePage(
  ctx: Ctx,
  input: {
    documentId: string;
    position: string;
    content: string;
    label?: string | undefined;
  },
): Promise<LeafRow | null> {
  const owned = await prisma.document.findFirst({
    where: { id: input.documentId, userId: ctx.userId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) return null;

  const row = await prisma.$transaction(async (tx) => {
    const notePage = await tx.notePage.create({
      data: { content: input.content, format: "markdown" },
      select: { id: true },
    });

    const leaf = await tx.leaf.create({
      data: {
        documentId: input.documentId,
        kind: "NOTE_PAGE",
        notePageId: notePage.id,
        position: input.position,
        label: input.label ?? null,
      },
      select: FIELDS,
    });

    await tx.document.update({
      where: { id: input.documentId },
      data: { leafCount: { increment: 1 } },
    });

    return leaf;
  });

  return serialise(row);
}

export async function move(
  ctx: Ctx,
  id: string,
  position: string,
): Promise<boolean> {
  const result = await prisma.leaf.updateMany({
    where: { id, document: { userId: ctx.userId } },
    data: { position },
  });
  return result.count > 0;
}

export async function update(
  ctx: Ctx,
  id: string,
  data: {
    label?: string | null | undefined;
    rotation?: number | undefined;
    hidden?: boolean | undefined;
  },
): Promise<boolean> {
  const result = await prisma.leaf.updateMany({
    where: { id, document: { userId: ctx.userId } },
    data,
  });
  return result.count > 0;
}

/**
 * "Deleting" a page hides the leaf. It never deletes a PDF page — positions
 * and annotation anchors have to stay stable (DATA_MODEL.md §4).
 */
export async function hide(ctx: Ctx, id: string): Promise<boolean> {
  const leaf = await findById(ctx, id);
  if (!leaf) return false;

  await prisma.$transaction([
    prisma.leaf.updateMany({
      where: { id, document: { userId: ctx.userId } },
      data: { hidden: true },
    }),
    prisma.document.update({
      where: { id: leaf.documentId },
      data: { leafCount: { decrement: 1 } },
    }),
  ]);
  return true;
}

/**
 * Recompute `leafCount` from what is actually there.
 *
 * It took a NUMBER before, and ingest passed the page count it had just
 * created. That is right exactly once — at first ingest, when the source
 * pages are all there is. On a retry of a document that has since gained note
 * pages, or had one hidden, it overwrites a correct count with a smaller one
 * and the library starts under-reporting the document.
 *
 * The counter is denormalised and maintained incrementally elsewhere
 * (+1 when a note page is added, -1 when a leaf is hidden), so it can drift.
 * Recounting here means a retry repairs it rather than corrupting it.
 *
 * Hidden leaves are excluded, which is what the rest of the app means by a
 * page count: `listForDocument` hides them, and the viewer never shows them.
 */
export async function recountLeaves(documentId: string): Promise<number> {
  const count = await prisma.leaf.count({
    where: { documentId, hidden: false },
  });

  await prisma.document.update({
    where: { id: documentId },
    data: { leafCount: count },
  });

  return count;
}

export async function firstLeafId(documentId: string): Promise<string | null> {
  const row = await prisma.leaf.findFirst({
    where: { documentId },
    select: { id: true },
    orderBy: { position: "asc" },
  });
  return row?.id ?? null;
}
