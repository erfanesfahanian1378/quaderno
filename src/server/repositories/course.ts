import { prisma } from "./client";
import type { Ctx } from "./base";

const FIELDS = {
  id: true,
  languageId: true,
  name: true,
  teacher: true,
  institution: true,
  isDefault: true,
  startsOn: true,
  endsOn: true,
  archivedAt: true,
} as const;

export type CourseRow = {
  id: string;
  languageId: string;
  name: string;
  teacher: string | null;
  institution: string | null;
  isDefault: boolean;
  startsOn: Date | null;
  endsOn: Date | null;
  archivedAt: Date | null;
};

export async function listForLanguage(
  ctx: Ctx,
  languageId: string,
): Promise<CourseRow[]> {
  return prisma.course.findMany({
    where: { userId: ctx.userId, languageId, archivedAt: null },
    select: FIELDS,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<CourseRow | null> {
  return prisma.course.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

export async function findDefault(
  ctx: Ctx,
  languageId: string,
): Promise<CourseRow | null> {
  return prisma.course.findFirst({
    where: { userId: ctx.userId, languageId, isDefault: true },
    select: FIELDS,
  });
}

export async function create(
  ctx: Ctx,
  input: {
    languageId: string;
    name: string;
    teacher?: string | undefined;
    institution?: string | undefined;
    startsOn?: Date | undefined;
    endsOn?: Date | undefined;
  },
): Promise<CourseRow> {
  return prisma.course.create({
    data: {
      userId: ctx.userId,
      languageId: input.languageId,
      name: input.name,
      teacher: input.teacher ?? null,
      institution: input.institution ?? null,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
    },
    select: FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: {
    name?: string | undefined;
    teacher?: string | null | undefined;
    institution?: string | null | undefined;
    startsOn?: Date | null | undefined;
    endsOn?: Date | null | undefined;
  },
): Promise<CourseRow | null> {
  const result = await prisma.course.updateMany({
    where: { id, userId: ctx.userId },
    data,
  });
  if (result.count === 0) return null;
  return findById(ctx, id);
}

export async function archive(ctx: Ctx, id: string): Promise<boolean> {
  // The default course is the fallback every document hangs off; archiving it
  // would leave new uploads with nowhere to go.
  const result = await prisma.course.updateMany({
    where: { id, userId: ctx.userId, isDefault: false },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function countForLanguage(
  ctx: Ctx,
  languageId: string,
): Promise<number> {
  return prisma.course.count({
    where: { userId: ctx.userId, languageId, archivedAt: null },
  });
}
