// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyIntegrationEnv,
  databaseReachable,
} from "../../setup/integration";
import type { prisma as PrismaInstance } from "@/server/repositories/client";
import type * as reminderService from "@/server/services/notifications/reminders";

type PrismaClient = typeof PrismaInstance;
type Reminders = typeof reminderService;

/**
 * When a reminder fires, and — the part that actually matters — that it fires
 * exactly once.
 *
 * The sweep runs every minute, so a class ten minutes away is considered ten
 * times. Nothing here checks the push itself; without VAPID keys `sendToUser`
 * is a no-op, which is exactly the right seam: what is being tested is the
 * DECISION and the claim that makes it single-shot.
 */
const EMAIL = "reminders@test.local";

let available = false;
let prisma: PrismaClient;
let reminders: Reminders;

let userId = "";
let languageId = "";
let scheduledClassId = "";

/** A Tuesday, well clear of a DST boundary in Europe/Rome. */
const CLASS_DAY = "2026-03-10";
const CLASS_TIME = "18:30";

function at(dayKey: string, hhmm: string): Date {
  // Europe/Rome is UTC+1 in March before the last Sunday.
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(
    `${dayKey}T${String(hours - 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`,
  );
}

beforeAll(async () => {
  applyIntegrationEnv();
  available = await databaseReachable();
  if (!available) {
    console.warn("[skip] Postgres is not reachable");
    return;
  }

  ({ prisma } = await import("@/server/repositories/client"));
  reminders = await import("@/server/services/notifications/reminders");

  await prisma.user.deleteMany({ where: { email: EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Reminders",
      passwordHash: "x",
      timeZone: "Europe/Rome",
      notifyClassMinutes: 10,
      notifyStudyAt: "19:00",
    },
    select: { id: true },
  });
  userId = user.id;

  // A subscription must exist or the sweep skips the user entirely — which is
  // itself a behaviour worth having, and is asserted below.
  await prisma.pushSubscription.create({
    data: {
      userId,
      endpoint: `https://push.test/${userId}`,
      p256dh: "key",
      auth: "auth",
    },
  });

  const language = await prisma.language.create({
    data: { userId, code: "it", name: "Italiano" },
    select: { id: true },
  });
  languageId = language.id;

  const scheduled = await prisma.scheduledClass.create({
    data: {
      userId,
      languageId,
      title: "Italiano B1",
      rrule: "FREQ=WEEKLY;BYDAY=TU",
      startTime: CLASS_TIME,
      durationMin: 90,
      timeZone: "Europe/Rome",
      startsOn: new Date("2026-01-01"),
    },
    select: { id: true },
  });
  scheduledClassId = scheduled.id;
});

afterAll(async () => {
  if (!available) return;
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

const logs = async (kind: string) =>
  prisma.notificationLog.findMany({
    where: { userId, kind },
    select: { key: true },
  });

describe("class reminders", () => {
  it("says nothing an hour before", async () => {
    if (!available) return;

    await reminders.sweep(at(CLASS_DAY, "17:30"));
    expect(await logs("class")).toEqual([]);
  });

  it("fires ten minutes before", async () => {
    if (!available) return;

    const result = await reminders.sweep(at(CLASS_DAY, "18:20"));
    expect(result.classReminders).toBe(1);
    expect(await logs("class")).toEqual([
      { key: `${scheduledClassId}:${CLASS_DAY}` },
    ]);
  });

  it("does not fire again on the next sweep", async () => {
    if (!available) return;

    // The whole point. A minute later, the class is still nine minutes away.
    const result = await reminders.sweep(at(CLASS_DAY, "18:21"));
    expect(result.classReminders).toBe(0);
    expect(await logs("class")).toHaveLength(1);
  });

  it("does not fire after the class has started", async () => {
    if (!available) return;

    await prisma.notificationLog.deleteMany({ where: { userId } });
    const result = await reminders.sweep(at(CLASS_DAY, "18:35"));
    expect(result.classReminders).toBe(0);
  });

  it("still fires if a sweep was missed, but not indefinitely", async () => {
    if (!available) return;
    await prisma.notificationLog.deleteMany({ where: { userId } });

    // Two minutes late: the worker restarted. Better late than never.
    expect((await reminders.sweep(at(CLASS_DAY, "18:22"))).classReminders).toBe(
      1,
    );

    await prisma.notificationLog.deleteMany({ where: { userId } });

    // Six minutes late is not a "ten minutes before" reminder any more.
    expect((await reminders.sweep(at(CLASS_DAY, "18:26"))).classReminders).toBe(
      0,
    );
  });

  it("says nothing when the reminder is switched off", async () => {
    if (!available) return;
    await prisma.notificationLog.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: { notifyClassMinutes: null },
    });

    expect((await reminders.sweep(at(CLASS_DAY, "18:20"))).classReminders).toBe(
      0,
    );

    await prisma.user.update({
      where: { id: userId },
      data: { notifyClassMinutes: 10 },
    });
  });

  it("skips a user with no subscribed browser", async () => {
    if (!available) return;
    await prisma.notificationLog.deleteMany({ where: { userId } });
    await prisma.pushSubscription.updateMany({
      where: { userId },
      data: { expiredAt: new Date() },
    });

    // Nothing to deliver to, so nothing is claimed either — otherwise
    // re-subscribing would silently skip today's reminder.
    expect((await reminders.sweep(at(CLASS_DAY, "18:20"))).classReminders).toBe(
      0,
    );
    expect(await logs("class")).toEqual([]);

    await prisma.pushSubscription.updateMany({
      where: { userId },
      data: { expiredAt: null },
    });
  });
});

describe("the daily study nudge", () => {
  it("fires at the chosen local time", async () => {
    if (!available) return;
    await prisma.notificationLog.deleteMany({ where: { userId } });

    const result = await reminders.sweep(at(CLASS_DAY, "19:00"));
    expect(result.studyReminders).toBe(1);
    expect(await logs("study")).toEqual([{ key: CLASS_DAY }]);
  });

  it("does not fire twice in a day", async () => {
    if (!available) return;

    expect((await reminders.sweep(at(CLASS_DAY, "19:01"))).studyReminders).toBe(
      0,
    );
    expect(await logs("study")).toHaveLength(1);
  });

  it("does not fire before its time", async () => {
    if (!available) return;
    await prisma.notificationLog.deleteMany({ where: { userId } });

    expect((await reminders.sweep(at(CLASS_DAY, "18:45"))).studyReminders).toBe(
      0,
    );
  });

  it("is a different reminder on a different day", async () => {
    if (!available) return;
    await prisma.notificationLog.deleteMany({ where: { userId } });

    await reminders.sweep(at("2026-03-11", "19:00"));
    await reminders.sweep(at("2026-03-12", "19:00"));

    expect((await logs("study")).map((row) => row.key).sort()).toEqual([
      "2026-03-11",
      "2026-03-12",
    ]);
  });
});
