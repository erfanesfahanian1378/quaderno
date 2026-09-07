import { prisma } from "./client";
import type { Ctx } from "./base";

const FIELDS = {
  id: true,
  languageId: true,
  courseId: true,
  title: true,
  rrule: true,
  startTime: true,
  durationMin: true,
  timeZone: true,
  location: true,
  startsOn: true,
  endsOn: true,
  active: true,
} as const;

export type ScheduledClassRow = {
  id: string;
  languageId: string;
  courseId: string | null;
  title: string;
  rrule: string;
  startTime: string;
  durationMin: number;
  timeZone: string;
  location: string | null;
  startsOn: Date;
  endsOn: Date | null;
  active: boolean;
};

export async function listActive(ctx: Ctx): Promise<ScheduledClassRow[]> {
  return prisma.scheduledClass.findMany({
    where: { userId: ctx.userId, active: true },
    select: FIELDS,
    orderBy: { startTime: "asc" },
  });
}

export async function listAll(ctx: Ctx): Promise<ScheduledClassRow[]> {
  return prisma.scheduledClass.findMany({
    where: { userId: ctx.userId },
    select: FIELDS,
    orderBy: [{ active: "desc" }, { startTime: "asc" }],
  });
}

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<ScheduledClassRow | null> {
  return prisma.scheduledClass.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

export async function create(
  ctx: Ctx,
  input: {
    languageId: string;
    courseId?: string | undefined;
    title: string;
    rrule: string;
    startTime: string;
    durationMin: number;
    timeZone: string;
    location?: string | undefined;
    startsOn: Date;
    endsOn?: Date | undefined;
  },
): Promise<ScheduledClassRow> {
  return prisma.scheduledClass.create({
    data: {
      userId: ctx.userId,
      languageId: input.languageId,
      courseId: input.courseId ?? null,
      title: input.title,
      rrule: input.rrule,
      startTime: input.startTime,
      durationMin: input.durationMin,
      timeZone: input.timeZone,
      location: input.location ?? null,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
    },
    select: FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: Partial<{
    title: string;
    rrule: string;
    startTime: string;
    durationMin: number;
    timeZone: string;
    location: string | null;
    endsOn: Date | null;
    active: boolean;
  }>,
): Promise<ScheduledClassRow | null> {
  const result = await prisma.scheduledClass.updateMany({
    where: { id, userId: ctx.userId },
    data,
  });
  if (result.count === 0) return null;
  return findById(ctx, id);
}

/**
 * Deactivates rather than deletes. Already-confirmed `ClassSession` rows keep
 * pointing at it (`onDelete: SetNull` would orphan them), and the user's
 * logged hours must survive them dropping a class.
 */
export async function deactivate(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.scheduledClass.updateMany({
    where: { id, userId: ctx.userId },
    data: { active: false },
  });
  return result.count > 0;
}
