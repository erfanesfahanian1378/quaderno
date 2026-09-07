import { RRule } from "rrule";
import { conflict, notFound } from "../../errors";
import type { Ctx } from "../../repositories/base";
import * as scheduled from "../../repositories/scheduled-class";
import * as classSessions from "../../repositories/class-session";
import * as users from "../../repositories/user";
import { logManual } from "../study";
import { dateToDayKey, wallTimeInZone } from "@/lib/time";

/**
 * Recurring classes. PHASE-12.
 *
 * The whole difficulty is DST. A class at 18:30 Europe/Rome must generate
 * 18:30 LOCAL occurrences either side of both transitions. rrule.js works in
 * UTC internally, so the correct shape is:
 *
 *   1. expand the rule in FLOATING local time (calendar days, no zone),
 *   2. interpret each result as a wall time in the stored IANA zone,
 *   3. convert to an instant.
 *
 * Expanding in UTC and adding a fixed offset gives you 17:30 for half the
 * year, and the bug is invisible until someone misses a class.
 */

export type Occurrence = {
  scheduledClassId: string;
  languageId: string;
  courseId: string | null;
  title: string;
  location: string | null;
  /** `YYYY-MM-DD` in the class's own zone. */
  date: string;
  startsAt: string;
  durationMin: number;
  classSessionId: string | null;
  attended: boolean | null;
  /** In the past and still unanswered. */
  needsConfirmation: boolean;
};

export async function upcoming(
  ctx: Ctx,
  days = 14,
  includePastDays = 14,
): Promise<Occurrence[]> {
  const rules = await scheduled.listActive(ctx);
  if (rules.length === 0) return [];

  const now = new Date();
  const from = new Date(now.getTime() - includePastDays * 86_400_000);
  const to = new Date(now.getTime() + days * 86_400_000);

  const out: Occurrence[] = [];

  for (const rule of rules) {
    for (const date of expand(rule, from, to)) {
      const [hours = 0, minutes = 0] = rule.startTime.split(":").map(Number);

      // Step 2: the expanded value is a WALL date; anchor it in the zone.
      const startsAt = wallTimeInZone(date, hours, minutes, rule.timeZone);

      out.push({
        scheduledClassId: rule.id,
        languageId: rule.languageId,
        courseId: rule.courseId,
        title: rule.title,
        location: rule.location,
        date,
        startsAt: startsAt.toISOString(),
        durationMin: rule.durationMin,
        classSessionId: null,
        attended: null,
        needsConfirmation: startsAt < now,
      });
    }
  }

  /*
   * Merge materialised ClassSession rows OVER generated occurrences, so a
   * class the user has already confirmed is never shown twice. API.md is
   * explicit about this, and it is what makes the list trustworthy.
   */
  const materialised = await classSessions.list(
    ctx,
    { from, to },
    { limit: 100 },
  );

  for (const session of materialised.items) {
    if (!session.scheduledClassId) continue;
    const key = dateToDayKey(session.date);

    const match = out.find(
      (entry) =>
        entry.scheduledClassId === session.scheduledClassId &&
        entry.date === key,
    );

    if (match) {
      match.classSessionId = session.id;
      match.attended = session.attended;
      match.needsConfirmation = false;
    }
  }

  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Step 1: expand in floating local time — no zone, no offset arithmetic. */
function expand(
  rule: scheduled.ScheduledClassRow,
  from: Date,
  to: Date,
): string[] {
  const options = RRule.parseString(rule.rrule);

  // A UTC-midnight dtstart makes rrule treat the expansion as floating: every
  // result lands at 00:00 UTC on the right CALENDAR day, which is exactly the
  // wall date step 2 needs.
  options.dtstart = new Date(`${dateToDayKey(rule.startsOn)}T00:00:00.000Z`);
  if (rule.endsOn) {
    options.until = new Date(`${dateToDayKey(rule.endsOn)}T23:59:59.000Z`);
  }

  return new RRule(options)
    .between(
      new Date(`${dateToDayKey(from)}T00:00:00.000Z`),
      new Date(`${dateToDayKey(to)}T23:59:59.000Z`),
      true,
    )
    .map((date) => date.toISOString().slice(0, 10));
}

/** Confirming attendance. Idempotent: repeating it creates nothing. */
export async function confirm(
  ctx: Ctx,
  scheduledClassId: string,
  dateKey: string,
  attended: boolean,
): Promise<{ classSessionId: string; loggedMinutes: number }> {
  const rule = await scheduled.findById(ctx, scheduledClassId);
  if (!rule) throw notFound("Scheduled class");

  const date = new Date(`${dateKey}T00:00:00.000Z`);

  const existing = await classSessions.findByScheduledOccurrence(
    ctx,
    scheduledClassId,
    date,
  );
  if (existing) {
    // Already answered. Not an error — the user tapped twice, or two devices
    // raced. Return what is already there.
    return { classSessionId: existing.id, loggedMinutes: 0 };
  }

  const session = await classSessions.create(ctx, {
    languageId: rule.languageId,
    courseId: rule.courseId ?? undefined,
    scheduledClassId: rule.id,
    date,
    title: rule.title,
    attended,
  });

  // "No, I didn't go" records the absence and logs NO time. Silence is not
  // the same as a no, which is why the prompt keeps appearing until answered.
  if (!attended) return { classSessionId: session.id, loggedMinutes: 0 };

  const [hours = 0, minutes = 0] = rule.startTime.split(":").map(Number);
  const startedAt = wallTimeInZone(dateKey, hours, minutes, rule.timeZone);

  await logManual(ctx, {
    languageId: rule.languageId,
    activity: "CLASS",
    startedAt,
    durationSec: rule.durationMin * 60,
    classSessionId: session.id,
    source: "SCHEDULE",
  });

  return { classSessionId: session.id, loggedMinutes: rule.durationMin };
}

export async function create(
  ctx: Ctx,
  input: {
    languageId: string;
    courseId?: string | undefined;
    title: string;
    /** 0 = Monday, matching the BYDAY order below. */
    weekdays: number[];
    startTime: string;
    durationMin: number;
    timeZone?: string | undefined;
    location?: string | undefined;
    startsOn: Date;
    endsOn?: Date | undefined;
  },
) {
  if (input.weekdays.length === 0) {
    throw conflict("Pick at least one day of the week.");
  }

  const days = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const byday = input.weekdays
    .map((index) => days[index])
    .filter(Boolean)
    .join(",");

  const user = await users.findById(ctx);
  const timeZone = input.timeZone ?? user?.timeZone ?? "Europe/Rome";

  return scheduled.create(ctx, {
    languageId: input.languageId,
    courseId: input.courseId,
    title: input.title,
    rrule: `FREQ=WEEKLY;BYDAY=${byday}`,
    startTime: input.startTime,
    durationMin: input.durationMin,
    timeZone,
    location: input.location,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
  });
}
