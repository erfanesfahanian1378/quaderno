import { prisma } from "./client";
import {
  cursorArgs,
  toPage,
  type Ctx,
  type CursorPage,
  type Paginated,
} from "./base";
import { dayKeyToDate } from "@/lib/time";

/**
 * Study repository: sessions, day aggregates and goals.
 *
 * The rule that governs this file (DATA_MODEL.md §7): **every session write
 * updates the affected `StudyDayAggregate` rows in the same transaction.**
 * Writing a session without updating the aggregate is a bug — every chart, the
 * streak and the heatmap read only the aggregate, so a missed update is
 * invisible until someone notices their week looks empty.
 */

export type StudySessionRow = {
  id: string;
  languageId: string;
  source: "TIMER" | "MANUAL" | "SCHEDULE";
  activity: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number;
  documentId: string | null;
  classSessionId: string | null;
  note: string | null;
  lastHeartbeatAt: Date | null;
};

const FIELDS = {
  id: true,
  languageId: true,
  source: true,
  activity: true,
  startedAt: true,
  endedAt: true,
  durationSec: true,
  documentId: true,
  classSessionId: true,
  note: true,
  lastHeartbeatAt: true,
} as const;

// --- Aggregates -------------------------------------------------------------

type DaySlice = { day: string; seconds: number };

/**
 * Applies a signed delta to the day aggregates. Called inside the same
 * transaction as the session write. `sessionDelta` is +1 on create, -1 on
 * delete, 0 on an edit that only moves time around.
 */
async function applyAggregateDelta(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  ctx: Ctx,
  languageId: string,
  slices: DaySlice[],
  sessionDelta: number,
): Promise<void> {
  for (const slice of slices) {
    const day = dayKeyToDate(slice.day);

    await tx.studyDayAggregate.upsert({
      where: {
        userId_languageId_day: { userId: ctx.userId, languageId, day },
      },
      create: {
        userId: ctx.userId,
        languageId,
        day,
        totalSec: Math.max(0, slice.seconds),
        sessionCount: Math.max(0, sessionDelta),
      },
      update: {
        totalSec: { increment: slice.seconds },
        sessionCount: { increment: sessionDelta },
      },
    });
  }

  // A subtraction can leave a row at zero; drop it so the heatmap does not
  // render a "studied today" cell for a day with no study in it.
  await tx.studyDayAggregate.deleteMany({
    where: { userId: ctx.userId, languageId, totalSec: { lte: 0 } },
  });
}

// --- Sessions ---------------------------------------------------------------

export async function findOpenTimer(ctx: Ctx): Promise<StudySessionRow | null> {
  return prisma.studySession.findFirst({
    where: { userId: ctx.userId, endedAt: null },
    select: FIELDS,
  });
}

export async function startTimer(
  ctx: Ctx,
  input: {
    languageId: string;
    activity: string;
    documentId?: string | undefined;
    classSessionId?: string | undefined;
  },
): Promise<StudySessionRow> {
  const now = new Date();
  return prisma.studySession.create({
    data: {
      userId: ctx.userId,
      languageId: input.languageId,
      source: "TIMER",
      activity: input.activity as never,
      startedAt: now,
      lastHeartbeatAt: now,
      documentId: input.documentId ?? null,
      classSessionId: input.classSessionId ?? null,
    },
    select: FIELDS,
  });
}

export async function heartbeat(ctx: Ctx): Promise<Date | null> {
  const now = new Date();
  const result = await prisma.studySession.updateMany({
    where: { userId: ctx.userId, endedAt: null },
    data: { lastHeartbeatAt: now },
  });
  return result.count > 0 ? now : null;
}

/** Stops the open timer and writes its aggregates in one transaction. */
export async function stopTimer(
  ctx: Ctx,
  timeZone: string,
  note: string | undefined,
  splitter: (from: Date, to: Date, tz: string) => DaySlice[],
): Promise<StudySessionRow | null> {
  return prisma.$transaction(async (tx) => {
    const open = await tx.studySession.findFirst({
      where: { userId: ctx.userId, endedAt: null },
      select: FIELDS,
    });
    if (!open) return null;

    const endedAt = new Date();
    const durationSec = Math.max(
      0,
      Math.round((endedAt.getTime() - open.startedAt.getTime()) / 1000),
    );

    const updated = await tx.studySession.update({
      where: { id: open.id },
      data: {
        endedAt,
        durationSec,
        lastHeartbeatAt: null,
        ...(note ? { note } : {}),
      },
      select: FIELDS,
    });

    await applyAggregateDelta(
      tx,
      ctx,
      open.languageId,
      splitter(open.startedAt, endedAt, timeZone),
      1,
    );

    return updated;
  });
}

export async function discardTimer(ctx: Ctx): Promise<boolean> {
  const result = await prisma.studySession.deleteMany({
    where: { userId: ctx.userId, endedAt: null },
  });
  return result.count > 0;
}

export async function logManual(
  ctx: Ctx,
  input: {
    languageId: string;
    activity: string;
    startedAt: Date;
    durationSec: number;
    note?: string | undefined;
    documentId?: string | undefined;
    classSessionId?: string | undefined;
    source?: "MANUAL" | "SCHEDULE" | undefined;
  },
  slices: DaySlice[],
): Promise<StudySessionRow> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.studySession.create({
      data: {
        userId: ctx.userId,
        languageId: input.languageId,
        source: (input.source ?? "MANUAL") as never,
        activity: input.activity as never,
        startedAt: input.startedAt,
        endedAt: new Date(input.startedAt.getTime() + input.durationSec * 1000),
        durationSec: input.durationSec,
        note: input.note ?? null,
        documentId: input.documentId ?? null,
        classSessionId: input.classSessionId ?? null,
      },
      select: FIELDS,
    });

    await applyAggregateDelta(tx, ctx, input.languageId, slices, 1);
    return created;
  });
}

export async function removeSession(
  ctx: Ctx,
  id: string,
  splitter: (from: Date, to: Date, tz: string) => DaySlice[],
  timeZone: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.studySession.findFirst({
      where: { id, userId: ctx.userId },
      select: FIELDS,
    });
    if (!session) return false;

    await tx.studySession.delete({ where: { id } });

    if (session.endedAt) {
      // Subtract exactly what was added.
      const slices = splitter(session.startedAt, session.endedAt, timeZone).map(
        (slice) => ({ day: slice.day, seconds: -slice.seconds }),
      );
      await applyAggregateDelta(tx, ctx, session.languageId, slices, -1);
    }

    return true;
  });
}

export async function listSessions(
  ctx: Ctx,
  filter: {
    languageId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
  },
  page: CursorPage,
): Promise<Paginated<StudySessionRow>> {
  const rows = await prisma.studySession.findMany({
    where: {
      userId: ctx.userId,
      ...(filter.languageId ? { languageId: filter.languageId } : {}),
      ...(filter.from || filter.to
        ? {
            startedAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    },
    select: FIELDS,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    ...cursorArgs(page),
  });
  return toPage(rows, page);
}

/** The reaper's query: timers whose heartbeat has gone quiet. */
export async function closeStaleTimers(
  staleBefore: Date,
): Promise<{ id: string; userId: string }[]> {
  const stale = await prisma.studySession.findMany({
    where: {
      endedAt: null,
      OR: [
        { lastHeartbeatAt: { lt: staleBefore } },
        { lastHeartbeatAt: null, startedAt: { lt: staleBefore } },
      ],
    },
    select: { id: true, userId: true, startedAt: true, lastHeartbeatAt: true },
  });

  for (const session of stale) {
    // Close it at its LAST HEARTBEAT, not now. A closed laptop costs at most
    // one minute of logged time, never a 14-hour phantom session.
    const endedAt = session.lastHeartbeatAt ?? session.startedAt;
    const durationSec = Math.max(
      0,
      Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    );
    await prisma.studySession.update({
      where: { id: session.id },
      data: { endedAt, durationSec, lastHeartbeatAt: null },
    });
  }

  return stale.map((s) => ({ id: s.id, userId: s.userId }));
}

// --- Aggregate reads (every chart uses these, never StudySession) -----------

export async function aggregatesBetween(
  ctx: Ctx,
  fromDay: string,
  toDay: string,
  languageId?: string,
): Promise<{ languageId: string; day: Date; totalSec: number }[]> {
  return prisma.studyDayAggregate.findMany({
    where: {
      userId: ctx.userId,
      ...(languageId ? { languageId } : {}),
      day: { gte: dayKeyToDate(fromDay), lte: dayKeyToDate(toDay) },
    },
    select: { languageId: true, day: true, totalSec: true },
    orderBy: { day: "asc" },
  });
}

export async function allActiveDays(
  ctx: Ctx,
  languageId?: string,
): Promise<{ day: Date; totalSec: number }[]> {
  const rows = await prisma.studyDayAggregate.groupBy({
    by: ["day"],
    where: {
      userId: ctx.userId,
      ...(languageId ? { languageId } : {}),
    },
    _sum: { totalSec: true },
    orderBy: { day: "asc" },
  });
  return rows.map((row) => ({
    day: row.day,
    totalSec: row._sum.totalSec ?? 0,
  }));
}

// --- Goals ------------------------------------------------------------------

/**
 * Goals are versioned by `effectiveFrom`, never overwritten, so raising your
 * target from 3h to 5h does not retroactively mark past weeks as failures.
 */
export async function currentGoals(ctx: Ctx): Promise<Map<string, number>> {
  const rows = await prisma.weeklyGoal.findMany({
    where: { userId: ctx.userId, effectiveFrom: { lte: new Date() } },
    select: { languageId: true, targetMinutes: true, effectiveFrom: true },
    orderBy: { effectiveFrom: "desc" },
  });

  const out = new Map<string, number>();
  for (const row of rows) {
    if (!out.has(row.languageId)) out.set(row.languageId, row.targetMinutes);
  }
  return out;
}

export async function setGoal(
  ctx: Ctx,
  languageId: string,
  targetMinutes: number,
): Promise<void> {
  const today = dayKeyToDate(new Date().toISOString().slice(0, 10));
  await prisma.weeklyGoal.upsert({
    where: {
      userId_languageId_effectiveFrom: {
        userId: ctx.userId,
        languageId,
        effectiveFrom: today,
      },
    },
    create: {
      userId: ctx.userId,
      languageId,
      targetMinutes,
      effectiveFrom: today,
    },
    update: { targetMinutes },
  });
}
