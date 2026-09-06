import { conflict, notFound, validationFailed } from "../errors";
import * as repo from "../repositories/study";
import * as users from "../repositories/user";
import type { Ctx } from "../repositories/base";
import {
  addDaysToKey,
  dateToDayKey,
  dayKeyInZone,
  splitAcrossDays,
  startOfWeekKey,
} from "@/lib/time";

/**
 * Study service. All the time-zone reasoning lives here so the repository
 * stays a thin, testable data layer.
 */

/** Minutes in a day below which it does not count towards a streak. */
const STREAK_MIN_MINUTES = 10;

async function userPrefs(ctx: Ctx) {
  const user = await users.findById(ctx);
  if (!user) throw notFound("Account");
  return { timeZone: user.timeZone, weekStartsOn: user.weekStartsOn };
}

export async function getOpenTimer(ctx: Ctx) {
  return repo.findOpenTimer(ctx);
}

export async function startTimer(
  ctx: Ctx,
  input: {
    languageId: string;
    activity?: string | undefined;
    documentId?: string | undefined;
    classSessionId?: string | undefined;
  },
) {
  // The partial unique index enforces this at the database level too; checking
  // here turns a constraint violation into the 409 API.md documents.
  if (await repo.findOpenTimer(ctx)) {
    throw conflict("A timer is already running. Stop it first.");
  }
  return repo.startTimer(ctx, {
    languageId: input.languageId,
    activity: input.activity ?? "OTHER",
    documentId: input.documentId,
    classSessionId: input.classSessionId,
  });
}

export async function heartbeat(ctx: Ctx) {
  const at = await repo.heartbeat(ctx);
  if (!at) throw notFound("Running timer");
  return { at };
}

export async function stopTimer(ctx: Ctx, note?: string) {
  const { timeZone } = await userPrefs(ctx);
  const stopped = await repo.stopTimer(ctx, timeZone, note, splitAcrossDays);
  if (!stopped) throw notFound("Running timer");
  return stopped;
}

export async function discardTimer(ctx: Ctx) {
  if (!(await repo.discardTimer(ctx))) throw notFound("Running timer");
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
) {
  if (input.durationSec <= 0) {
    throw validationFailed("A session needs a duration", {
      field: "durationSec",
    });
  }
  if (input.durationSec > 24 * 3600) {
    throw validationFailed("That is longer than a day", {
      field: "durationSec",
    });
  }

  const { timeZone } = await userPrefs(ctx);
  const endedAt = new Date(
    input.startedAt.getTime() + input.durationSec * 1000,
  );
  const slices = splitAcrossDays(input.startedAt, endedAt, timeZone);

  return repo.logManual(ctx, input, slices);
}

export async function deleteSession(ctx: Ctx, id: string) {
  const { timeZone } = await userPrefs(ctx);
  if (!(await repo.removeSession(ctx, id, splitAcrossDays, timeZone))) {
    throw notFound("Session");
  }
}

// --- Reads for the dashboard and stats --------------------------------------

export type WeekSummary = {
  languageId: string;
  targetMinutes: number;
  actualMinutes: number;
  byDay: { day: string; minutes: number }[];
  /** Negative = behind, positive = ahead, in minutes, against elapsed pace. */
  paceMinutes: number;
};

/**
 * This week per language: the numbers behind every goal ring on the dashboard.
 * Reads `StudyDayAggregate` only — never a scan over sessions.
 */
export async function weekSummary(ctx: Ctx): Promise<WeekSummary[]> {
  const { timeZone, weekStartsOn } = await userPrefs(ctx);
  const today = dayKeyInZone(new Date(), timeZone);
  const weekStart = startOfWeekKey(today, weekStartsOn);
  const weekEnd = addDaysToKey(weekStart, 6);

  const [rows, goals] = await Promise.all([
    repo.aggregatesBetween(ctx, weekStart, weekEnd),
    repo.currentGoals(ctx),
  ]);

  const days = Array.from({ length: 7 }, (_, index) =>
    addDaysToKey(weekStart, index),
  );

  const byLanguage = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = dateToDayKey(row.day);
    const map = byLanguage.get(row.languageId) ?? new Map<string, number>();
    map.set(key, (map.get(key) ?? 0) + row.totalSec);
    byLanguage.set(row.languageId, map);
  }

  // Elapsed days including today, so pace on Wednesday expects 3/7 of the goal.
  const elapsed = days.filter((day) => day <= today).length;

  const languageIds = new Set([...byLanguage.keys(), ...goals.keys()]);

  return [...languageIds].map((languageId) => {
    const perDay = byLanguage.get(languageId) ?? new Map<string, number>();
    const byDay = days.map((day) => ({
      day,
      minutes: Math.round((perDay.get(day) ?? 0) / 60),
    }));
    const actualMinutes = byDay.reduce((sum, entry) => sum + entry.minutes, 0);
    const targetMinutes = goals.get(languageId) ?? 0;
    const expectedSoFar = Math.round((targetMinutes * elapsed) / 7);

    return {
      languageId,
      targetMinutes,
      actualMinutes,
      byDay,
      paceMinutes: actualMinutes - expectedSoFar,
    };
  });
}

/** Streaks, computed in the user's zone, with a plain minimum to count. */
export async function streak(
  ctx: Ctx,
): Promise<{ current: number; longest: number; lastActiveDay: string | null }> {
  const { timeZone } = await userPrefs(ctx);
  const rows = await repo.allActiveDays(ctx);

  const qualifying = rows
    .filter((row) => row.totalSec >= STREAK_MIN_MINUTES * 60)
    .map((row) => dateToDayKey(row.day))
    .sort();

  if (qualifying.length === 0) {
    return { current: 0, longest: 0, lastActiveDay: null };
  }

  let longest = 1;
  let run = 1;
  for (let i = 1; i < qualifying.length; i += 1) {
    const previous = qualifying[i - 1]!;
    const day = qualifying[i]!;
    run = addDaysToKey(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // The current run only counts if it reaches today or yesterday — otherwise
  // it ended, and calling it "current" would be a lie.
  const today = dayKeyInZone(new Date(), timeZone);
  const last = qualifying[qualifying.length - 1]!;
  const current = last === today || last === addDaysToKey(today, -1) ? run : 0;

  return { current, longest, lastActiveDay: last };
}

export async function heatmap(ctx: Ctx, languageId?: string) {
  const rows = await repo.allActiveDays(ctx, languageId);
  return rows.map((row) => ({
    day: dateToDayKey(row.day),
    totalSec: row.totalSec,
  }));
}

export async function setGoal(
  ctx: Ctx,
  languageId: string,
  targetMinutes: number,
) {
  if (targetMinutes < 0 || targetMinutes > 60 * 100) {
    throw validationFailed("That goal is out of range", {
      field: "targetMinutes",
    });
  }
  await repo.setGoal(ctx, languageId, targetMinutes);
}

export async function goals(ctx: Ctx) {
  return repo.currentGoals(ctx);
}
