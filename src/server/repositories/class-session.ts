import { prisma } from "./client";
import {
  cursorArgs,
  toPage,
  type Ctx,
  type CursorPage,
  type Paginated,
} from "./base";

const FIELDS = {
  id: true,
  languageId: true,
  courseId: true,
  scheduledClassId: true,
  date: true,
  title: true,
  topics: true,
  summary: true,
  attended: true,
  createdAt: true,
} as const;

export type ClassSessionRow = {
  id: string;
  languageId: string;
  courseId: string | null;
  scheduledClassId: string | null;
  date: Date;
  title: string;
  topics: string[];
  summary: string | null;
  attended: boolean;
  createdAt: Date;
};

export async function list(
  ctx: Ctx,
  filter: {
    languageId?: string | undefined;
    courseId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
  },
  page: CursorPage,
): Promise<Paginated<ClassSessionRow>> {
  const rows = await prisma.classSession.findMany({
    where: {
      userId: ctx.userId,
      ...(filter.languageId ? { languageId: filter.languageId } : {}),
      ...(filter.courseId ? { courseId: filter.courseId } : {}),
      ...(filter.from || filter.to
        ? {
            date: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    },
    select: FIELDS,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    ...cursorArgs(page),
  });
  return toPage(rows, page);
}

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<ClassSessionRow | null> {
  return prisma.classSession.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

export async function create(
  ctx: Ctx,
  input: {
    languageId: string;
    courseId?: string | undefined;
    scheduledClassId?: string | undefined;
    date: Date;
    title: string;
    topics?: string[] | undefined;
    summary?: string | undefined;
    attended?: boolean | undefined;
    /** The link this class actually used, kept as a record of the past. */
    meetingUrl?: string | null | undefined;
  },
): Promise<ClassSessionRow> {
  return prisma.classSession.create({
    data: {
      userId: ctx.userId,
      languageId: input.languageId,
      courseId: input.courseId ?? null,
      scheduledClassId: input.scheduledClassId ?? null,
      date: input.date,
      title: input.title,
      topics: input.topics ?? [],
      summary: input.summary ?? null,
      meetingUrl: input.meetingUrl ?? null,
      attended: input.attended ?? true,
    },
    select: FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: {
    date?: Date | undefined;
    title?: string | undefined;
    topics?: string[] | undefined;
    summary?: string | null | undefined;
    attended?: boolean | undefined;
    courseId?: string | null | undefined;
  },
): Promise<ClassSessionRow | null> {
  const result = await prisma.classSession.updateMany({
    where: { id, userId: ctx.userId },
    data,
  });
  if (result.count === 0) return null;
  return findById(ctx, id);
}

export async function remove(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.classSession.deleteMany({
    where: { id, userId: ctx.userId },
  });
  return result.count > 0;
}

/** Was this scheduled occurrence already confirmed? Keeps confirm idempotent. */
export async function findByScheduledOccurrence(
  ctx: Ctx,
  scheduledClassId: string,
  date: Date,
): Promise<ClassSessionRow | null> {
  return prisma.classSession.findFirst({
    where: { userId: ctx.userId, scheduledClassId, date },
    select: FIELDS,
  });
}

export async function upcoming(ctx: Ctx, limit = 5) {
  return prisma.classSession.findMany({
    where: { userId: ctx.userId, date: { gte: new Date() } },
    select: FIELDS,
    orderBy: { date: "asc" },
    take: limit,
  });
}
