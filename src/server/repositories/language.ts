import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * Language repository. Every function scopes on `ctx.userId` itself —
 * `Language` is per-user, not a global lookup table (DATA_MODEL.md §2), so a
 * language id is only ever meaningful inside one account.
 */

const FIELDS = {
  id: true,
  code: true,
  name: true,
  accentKey: true,
  cefrLevel: true,
  position: true,
  archivedAt: true,
  createdAt: true,
} as const;

export type LanguageRow = {
  id: string;
  code: string;
  name: string;
  accentKey: string;
  cefrLevel: string | null;
  position: number;
  archivedAt: Date | null;
  createdAt: Date;
};

export async function list(
  ctx: Ctx,
  options: { includeArchived?: boolean } = {},
): Promise<LanguageRow[]> {
  return prisma.language.findMany({
    where: {
      userId: ctx.userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    select: FIELDS,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<LanguageRow | null> {
  return prisma.language.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

export async function findByCode(
  ctx: Ctx,
  code: string,
): Promise<LanguageRow | null> {
  return prisma.language.findFirst({
    where: { userId: ctx.userId, code },
    select: FIELDS,
  });
}

/**
 * Creating a language creates its default course in the SAME transaction.
 * DATA_MODEL.md §2: every language gets one `Course` with `isDefault = true`,
 * and the UI hides the concept of courses entirely until a second one exists.
 * Two statements outside a transaction would leave a language with no course
 * if the second one failed.
 */
export async function createWithDefaultCourse(
  ctx: Ctx,
  input: {
    code: string;
    name: string;
    accentKey: string;
    cefrLevel?: string | undefined;
    position: number;
    defaultCourseName: string;
  },
): Promise<LanguageRow> {
  return prisma.$transaction(async (tx) => {
    const language = await tx.language.create({
      data: {
        userId: ctx.userId,
        code: input.code,
        name: input.name,
        accentKey: input.accentKey,
        cefrLevel: input.cefrLevel ?? null,
        position: input.position,
      },
      select: FIELDS,
    });

    await tx.course.create({
      data: {
        userId: ctx.userId,
        languageId: language.id,
        name: input.defaultCourseName,
        isDefault: true,
      },
    });

    return language;
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: {
    name?: string | undefined;
    accentKey?: string | undefined;
    cefrLevel?: string | null | undefined;
    position?: number | undefined;
  },
): Promise<LanguageRow | null> {
  const result = await prisma.language.updateMany({
    where: { id, userId: ctx.userId },
    data,
  });
  if (result.count === 0) return null;
  return findById(ctx, id);
}

export async function archive(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.language.updateMany({
    where: { id, userId: ctx.userId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function unarchive(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.language.updateMany({
    where: { id, userId: ctx.userId },
    data: { archivedAt: null },
  });
  return result.count > 0;
}

/** Hard delete. The service refuses unless the language is empty. */
export async function remove(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.language.deleteMany({
    where: { id, userId: ctx.userId },
  });
  return result.count > 0;
}

export async function countDocuments(ctx: Ctx, id: string): Promise<number> {
  return prisma.document.count({
    where: { userId: ctx.userId, languageId: id, deletedAt: null },
  });
}

/** Bulk reorder from a drag. One transaction so the list is never half-sorted. */
export async function reorder(ctx: Ctx, orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.language.updateMany({
        where: { id, userId: ctx.userId },
        data: { position: index },
      }),
    ),
  );
}

export async function takenAccentKeys(ctx: Ctx): Promise<string[]> {
  const rows = await prisma.language.findMany({
    where: { userId: ctx.userId, archivedAt: null },
    select: { accentKey: true },
  });
  return rows.map((row) => row.accentKey);
}

export async function nextPosition(ctx: Ctx): Promise<number> {
  const last = await prisma.language.findFirst({
    where: { userId: ctx.userId },
    select: { position: true },
    orderBy: { position: "desc" },
  });
  return (last?.position ?? -1) + 1;
}
