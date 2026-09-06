import { describe, expect, it } from "vitest";
import {
  dayKeyInZone,
  formatDuration,
  splitAcrossDays,
  startOfDayInZone,
  startOfWeekKey,
} from "@/lib/time";

/**
 * The day-boundary maths from DATA_MODEL.md §7. These are the cases that
 * silently corrupt a year of study data if they are wrong, and none of them
 * are visible in normal use.
 */

const ROME = "Europe/Rome";

describe("dayKeyInZone", () => {
  it("uses the user's zone, not UTC", () => {
    // 23:30 UTC on 11 March is already 00:30 on 12 March in Rome (UTC+1).
    const instant = new Date("2026-03-11T23:30:00.000Z");
    expect(dayKeyInZone(instant, "UTC")).toBe("2026-03-11");
    expect(dayKeyInZone(instant, ROME)).toBe("2026-03-12");
  });

  it("handles a zone behind UTC", () => {
    const instant = new Date("2026-03-12T02:30:00.000Z");
    expect(dayKeyInZone(instant, "America/New_York")).toBe("2026-03-11");
  });
});

describe("startOfDayInZone", () => {
  it("returns local midnight, not UTC midnight", () => {
    // Rome is UTC+1 in January, so local midnight is 23:00 UTC the day before.
    expect(startOfDayInZone("2026-01-15", ROME).toISOString()).toBe(
      "2026-01-14T23:00:00.000Z",
    );
  });

  it("survives the spring-forward transition", () => {
    // Italy springs forward on 29 March 2026; that day still starts at local
    // midnight, which is 23:00 UTC on the 28th (still CET at that moment).
    expect(startOfDayInZone("2026-03-29", ROME).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
  });

  it("survives the autumn fall-back transition", () => {
    expect(startOfDayInZone("2026-10-25", ROME).toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
  });
});

describe("splitAcrossDays", () => {
  /**
   * The PHASE-08 acceptance criterion, verbatim: "A session from 23:30 to
   * 00:30 in Europe/Rome produces 30 minutes on each of two days."
   */
  it("splits a session that crosses local midnight", () => {
    const started = new Date("2026-01-15T22:30:00.000Z"); // 23:30 Rome
    const ended = new Date("2026-01-15T23:30:00.000Z"); // 00:30 Rome, 16th

    const split = splitAcrossDays(started, ended, ROME);

    expect(split).toEqual([
      { day: "2026-01-15", seconds: 1800 },
      { day: "2026-01-16", seconds: 1800 },
    ]);
  });

  it("keeps a session inside one day as one entry", () => {
    const started = new Date("2026-01-15T09:00:00.000Z");
    const ended = new Date("2026-01-15T10:30:00.000Z");

    expect(splitAcrossDays(started, ended, ROME)).toEqual([
      { day: "2026-01-15", seconds: 5400 },
    ]);
  });

  it("spans several days without losing a second", () => {
    const started = new Date("2026-01-15T09:00:00.000Z");
    const ended = new Date("2026-01-18T09:00:00.000Z");

    const split = splitAcrossDays(started, ended, ROME);
    const total = split.reduce((sum, entry) => sum + entry.seconds, 0);

    expect(total).toBe(3 * 86_400);
    expect(split).toHaveLength(4);
  });

  it("returns nothing for a zero or negative duration", () => {
    const at = new Date("2026-01-15T09:00:00.000Z");
    expect(splitAcrossDays(at, at, ROME)).toEqual([]);
    expect(splitAcrossDays(at, new Date(at.getTime() - 1000), ROME)).toEqual(
      [],
    );
  });

  it("does not lose an hour across the spring-forward night", () => {
    // 22:00 UTC 28 Mar (23:00 CET) to 02:00 UTC 29 Mar (04:00 CEST).
    const started = new Date("2026-03-28T22:00:00.000Z");
    const ended = new Date("2026-03-29T02:00:00.000Z");

    const split = splitAcrossDays(started, ended, ROME);
    const total = split.reduce((sum, entry) => sum + entry.seconds, 0);

    // Four real hours elapsed, regardless of what the clock did.
    expect(total).toBe(4 * 3600);
    expect(split.map((entry) => entry.day)).toEqual([
      "2026-03-28",
      "2026-03-29",
    ]);
  });
});

describe("startOfWeekKey", () => {
  it("starts the week on Monday for weekStartsOn = 1", () => {
    // 2026-01-15 is a Thursday.
    expect(startOfWeekKey("2026-01-15", 1)).toBe("2026-01-12");
  });

  it("starts the week on Sunday for weekStartsOn = 0", () => {
    expect(startOfWeekKey("2026-01-15", 0)).toBe("2026-01-11");
  });

  it("leaves the first day of the week unchanged", () => {
    expect(startOfWeekKey("2026-01-12", 1)).toBe("2026-01-12");
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0m"],
    [59, "1m"],
    [1800, "30m"],
    [3600, "1h"],
    [6000, "1h 40m"],
    [7200, "2h"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
