import { prisma } from "@/server/repositories/client";
import { upcoming } from "@/server/services/study/schedule";
import { dayKeyInZone, partsInZone } from "@/lib/time";
import { sendToUser, pushConfigured } from "./push";
import { logger } from "@/server/logger";

/**
 * Deciding what to remind someone about, and making sure it happens once.
 *
 * The sweep runs every minute, so "is this class soon?" is asked sixty times
 * an hour for the same class. Sending is therefore gated on a
 * `NotificationLog` row with a unique key — the insert failing IS the check.
 * A check-then-send would race two overlapping sweeps and send twice, which
 * for a lock-screen notification is the whole complaint.
 */

export type SweepResult = {
  classReminders: number;
  studyReminders: number;
};

/**
 * How far ahead of the target minute a reminder may still fire.
 *
 * The sweep is scheduled every minute but is not guaranteed to run on the
 * minute — the queue can be busy, the worker can restart. Without slack a
 * reminder that missed its minute would never be sent at all; with too much,
 * a "10 minutes before" lands at 14. Three minutes is the compromise, and the
 * dedupe key means the slack cannot cause a repeat.
 */
const SLACK_MINUTES = 3;

export async function sweep(now: Date = new Date()): Promise<SweepResult> {
  if (!pushConfigured()) return { classReminders: 0, studyReminders: 0 };

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      // Only users who could actually receive one. Everything below is per
      // user and would otherwise run for accounts that never opted in.
      pushSubscriptions: { some: { expiredAt: null } },
      OR: [
        { notifyClassMinutes: { not: null } },
        { notifyStudyAt: { not: null } },
      ],
    },
    select: {
      id: true,
      timeZone: true,
      notifyClassMinutes: true,
      notifyStudyAt: true,
    },
  });

  let classReminders = 0;
  let studyReminders = 0;

  for (const user of users) {
    try {
      if (user.notifyClassMinutes != null) {
        classReminders += await remindAboutClasses(
          { userId: user.id },
          user.notifyClassMinutes,
          now,
        );
      }

      if (user.notifyStudyAt) {
        studyReminders += await remindToStudy(
          { userId: user.id },
          user.notifyStudyAt,
          user.timeZone,
          now,
        );
      }
    } catch (error) {
      // One user's broken schedule must not stop everyone else's reminders.
      logger.error({ err: error, userId: user.id }, "reminder sweep failed");
    }
  }

  return { classReminders, studyReminders };
}

async function remindAboutClasses(
  ctx: { userId: string },
  minutesBefore: number,
  now: Date,
): Promise<number> {
  // A two-day window: enough to cover today and a class just after midnight,
  // small enough that the RRULE expansion stays cheap.
  // Around `now`, not around the real clock: the sweep is given its moment
  // and everything it decides has to follow from it.
  const occurrences = await upcoming(ctx, 2, 1, now);
  let sent = 0;

  for (const occurrence of occurrences) {
    const startsAt = new Date(occurrence.startsAt);
    const minutesAway = (startsAt.getTime() - now.getTime()) / 60_000;

    // Already started, or not yet due a reminder.
    if (minutesAway < 0) continue;
    if (minutesAway > minutesBefore) continue;
    if (minutesAway < minutesBefore - SLACK_MINUTES) continue;

    const key = `${occurrence.scheduledClassId}:${occurrence.date}`;
    if (!(await claim(ctx.userId, "class", key))) continue;

    const when = Math.max(1, Math.round(minutesAway));
    await sendToUser(ctx.userId, {
      title: occurrence.title,
      body: [
        `Starts in ${when} minute${when === 1 ? "" : "s"}`,
        occurrence.meetingUrl ? "Tap to join" : occurrence.location,
      ]
        .filter(Boolean)
        .join(" · "),
      // Straight into the call when there is one — the reason to look at a
      // reminder ten minutes before a class is to be in the room on time.
      url: occurrence.meetingUrl ?? "/schedule",
      tag: `class:${key}`,
    });

    sent += 1;
  }

  return sent;
}

async function remindToStudy(
  ctx: { userId: string },
  at: string,
  timeZone: string,
  now: Date,
): Promise<number> {
  const [hours = 0, minutes = 0] = at.split(":").map(Number);

  /*
   * Compared in the USER'S zone, not the server's. A nudge set for 19:00
   * means seven in the evening where they are — the same question the class
   * schedule answers with wallTimeInZone, and the same trap if it is skipped.
   */
  const local = partsInZone(now, timeZone);
  const minutesNow = local.hour * 60 + local.minute;
  const target = hours * 60 + minutes;

  if (minutesNow < target) return 0;
  if (minutesNow > target + SLACK_MINUTES) return 0;

  const dayKey = dayKeyInZone(now, timeZone);
  if (!(await claim(ctx.userId, "study", dayKey))) return 0;

  // What they have already done today, so the nudge is not sent to someone who
  // has been studying for an hour.
  const [studied, due] = await Promise.all([
    minutesStudiedOn(ctx.userId, dayKey),
    dueCardCount(ctx.userId, dayKey),
  ]);

  if (studied > 0 && due === 0) {
    // Already worked today and nothing waiting. Claimed, so the sweep will
    // not reconsider — but nothing is sent.
    return 0;
  }

  await sendToUser(ctx.userId, {
    title:
      due > 0
        ? `${due} card${due === 1 ? "" : "s"} to review`
        : "Time to study",
    body:
      studied > 0
        ? "You have already put some time in today — a few cards would finish it off."
        : "A few minutes now is worth an hour at the weekend.",
    url: due > 0 ? "/review" : "/study",
    tag: `study:${dayKey}`,
  });

  return 1;
}

/**
 * Take the right to send this exact reminder, once.
 *
 * The unique constraint does the work: a second sweep's insert fails and it
 * silently declines rather than sending a duplicate.
 */
async function claim(
  userId: string,
  kind: string,
  key: string,
): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { userId, kind, key } });
    return true;
  } catch {
    return false;
  }
}

async function minutesStudiedOn(
  userId: string,
  dayKey: string,
): Promise<number> {
  // The aggregate's `day` is already stored in the user's zone at write time
  // (see the model), so the day key can be compared to it directly.
  const aggregate = await prisma.studyDayAggregate.aggregate({
    where: { userId, day: new Date(`${dayKey}T00:00:00.000Z`) },
    _sum: { totalSec: true },
  });
  return Math.round((aggregate._sum?.totalSec ?? 0) / 60);
}

async function dueCardCount(userId: string, dayKey: string): Promise<number> {
  return prisma.reviewCard.count({
    where: { userId, retiredAt: null, dueOn: { lte: dayKey } },
  });
}
