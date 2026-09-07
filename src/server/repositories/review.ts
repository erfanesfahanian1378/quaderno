import { prisma } from "./client";
import type { Ctx } from "./base";
import type { Grade } from "@/server/services/review/sm2";

export type CardRow = {
  id: string;
  notePageId: string;
  languageId: string | null;
  row: number;
  rowKey: string;
  front: string;
  back: string;
  example: string | null;
  note: string | null;
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  dueOn: string;
  retiredAt: Date | null;
};

const FIELDS = {
  id: true,
  notePageId: true,
  languageId: true,
  row: true,
  rowKey: true,
  front: true,
  back: true,
  example: true,
  note: true,
  ease: true,
  intervalDays: true,
  reps: true,
  lapses: true,
  dueOn: true,
  retiredAt: true,
} as const;

/**
 * Every card on a page, retired ones included.
 *
 * The sync needs the retired ones: restoring a row a learner deleted by
 * accident should bring its schedule back, not start it from zero.
 */
export async function forNotePage(
  ctx: Ctx,
  notePageId: string,
): Promise<CardRow[]> {
  return prisma.reviewCard.findMany({
    where: { userId: ctx.userId, notePageId },
    orderBy: { row: "asc" },
    select: FIELDS,
  });
}

export type CardWrite = {
  notePageId: string;
  languageId: string | null;
  row: number;
  rowKey: string;
  front: string;
  back: string;
  example: string | null;
  note: string | null;
  dueOn: string;
};

export async function createMany(
  ctx: Ctx,
  cards: CardWrite[],
): Promise<number> {
  if (cards.length === 0) return 0;
  const result = await prisma.reviewCard.createMany({
    data: cards.map((card) => ({ ...card, userId: ctx.userId })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Content only. Never scheduling — that is what preserves review history. */
export async function updateContent(
  ctx: Ctx,
  id: string,
  data: {
    row: number;
    rowKey: string;
    front: string;
    back: string;
    example: string | null;
    note: string | null;
    languageId: string | null;
  },
): Promise<void> {
  await prisma.reviewCard.updateMany({
    where: { id, userId: ctx.userId },
    data: { ...data, retiredAt: null },
  });
}

export async function retire(ctx: Ctx, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.reviewCard.updateMany({
    where: { id: { in: ids }, userId: ctx.userId, retiredAt: null },
    data: { retiredAt: new Date() },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// The review queue
// ---------------------------------------------------------------------------

export async function due(
  ctx: Ctx,
  todayKey: string,
  options: { languageId?: string; limit?: number } = {},
): Promise<CardRow[]> {
  return prisma.reviewCard.findMany({
    where: {
      userId: ctx.userId,
      retiredAt: null,
      dueOn: { lte: todayKey },
      ...(options.languageId ? { languageId: options.languageId } : {}),
    },
    // Oldest due first, then the ones seen least — a card buried under a
    // backlog should not stay buried.
    orderBy: [{ dueOn: "asc" }, { reps: "asc" }, { createdAt: "asc" }],
    take: options.limit ?? 50,
    select: FIELDS,
  });
}

export async function dueCount(
  ctx: Ctx,
  todayKey: string,
  languageId?: string,
): Promise<number> {
  return prisma.reviewCard.count({
    where: {
      userId: ctx.userId,
      retiredAt: null,
      dueOn: { lte: todayKey },
      ...(languageId ? { languageId } : {}),
    },
  });
}

/** Due counts for every language at once, for the dashboard. */
export async function dueByLanguage(
  ctx: Ctx,
  todayKey: string,
): Promise<Record<string, number>> {
  const rows = await prisma.reviewCard.groupBy({
    by: ["languageId"],
    where: { userId: ctx.userId, retiredAt: null, dueOn: { lte: todayKey } },
    _count: { _all: true },
  });

  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.languageId) out[row.languageId] = row._count._all;
  }
  return out;
}

export async function findById(ctx: Ctx, id: string): Promise<CardRow | null> {
  return prisma.reviewCard.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

/**
 * Apply a grade. The card update and the log are one transaction: a graded
 * card with no log would corrupt the history that a future scheduler is
 * supposed to learn from.
 */
export async function applyGrade(
  ctx: Ctx,
  id: string,
  grade: Grade,
  next: {
    ease: number;
    intervalDays: number;
    reps: number;
    lapses: number;
    dueOn: string;
  },
  before: { intervalDays: number },
  elapsedMs: number | null,
): Promise<void> {
  await prisma.$transaction([
    prisma.reviewCard.updateMany({
      where: { id, userId: ctx.userId },
      data: { ...next, lastGradedAt: new Date() },
    }),
    prisma.reviewLog.create({
      data: {
        userId: ctx.userId,
        cardId: id,
        grade,
        intervalBefore: before.intervalDays,
        intervalAfter: next.intervalDays,
        easeAfter: next.ease,
        elapsedMs,
      },
    }),
  ]);
}

/** Cards for an export: a whole language, one document, or one page. */
export async function forExport(
  ctx: Ctx,
  scope: { languageId?: string; documentId?: string; notePageId?: string },
): Promise<CardRow[]> {
  return prisma.reviewCard.findMany({
    where: {
      userId: ctx.userId,
      retiredAt: null,
      ...(scope.languageId ? { languageId: scope.languageId } : {}),
      ...(scope.notePageId ? { notePageId: scope.notePageId } : {}),
      ...(scope.documentId
        ? { notePage: { leaf: { documentId: scope.documentId } } }
        : {}),
    },
    orderBy: [{ notePageId: "asc" }, { row: "asc" }],
    select: FIELDS,
  });
}
