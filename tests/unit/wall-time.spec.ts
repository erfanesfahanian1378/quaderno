import { describe, expect, it } from "vitest";
import { partsInZone, wallTimeInZone } from "@/lib/time";

/**
 * The DST trap, pinned.
 *
 * PHASE-12 acceptance criterion: "A weekly class at 18:30 Europe/Rome still
 * generates 18:30 local occurrences across the March and October DST
 * changes." Expanding an RRULE in UTC and adding a fixed offset gives 17:30
 * for half the year, and nobody notices until someone misses a class.
 */

const ROME = "Europe/Rome";

function localTime(instant: Date, timeZone: string): string {
  const { hour, minute } = partsInZone(instant, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

describe("wallTimeInZone", () => {
  it("holds 18:30 local through the whole year in Rome", () => {
    // Every Tuesday of 2026, either side of both transitions.
    const tuesdays: string[] = [];
    const cursor = new Date(Date.UTC(2026, 0, 6)); // a Tuesday
    while (cursor.getUTCFullYear() === 2026) {
      tuesdays.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    expect(tuesdays.length).toBeGreaterThan(50);

    for (const day of tuesdays) {
      const instant = wallTimeInZone(day, 18, 30, ROME);
      expect(localTime(instant, ROME), `wrong local time on ${day}`).toBe(
        "18:30",
      );
    }
  });

  it("produces a different UTC instant either side of the spring change", () => {
    // Italy springs forward on 29 March 2026.
    const before = wallTimeInZone("2026-03-24", 18, 30, ROME);
    const after = wallTimeInZone("2026-03-31", 18, 30, ROME);

    expect(before.toISOString()).toContain("T17:30");
    expect(after.toISOString()).toContain("T16:30");

    // Both still read 18:30 to the person attending the class.
    expect(localTime(before, ROME)).toBe("18:30");
    expect(localTime(after, ROME)).toBe("18:30");
  });

  it("does the same across the autumn change", () => {
    // Italy falls back on 25 October 2026.
    const before = wallTimeInZone("2026-10-20", 18, 30, ROME);
    const after = wallTimeInZone("2026-10-27", 18, 30, ROME);

    expect(before.toISOString()).toContain("T16:30");
    expect(after.toISOString()).toContain("T17:30");
    expect(localTime(before, ROME)).toBe("18:30");
    expect(localTime(after, ROME)).toBe("18:30");
  });

  it("works for a zone behind UTC", () => {
    const instant = wallTimeInZone("2026-07-15", 9, 0, "America/New_York");
    expect(localTime(instant, "America/New_York")).toBe("09:00");
    expect(instant.toISOString()).toContain("T13:00");
  });

  it("handles an early-morning class, where the date can roll", () => {
    const instant = wallTimeInZone("2026-01-15", 0, 30, ROME);
    expect(localTime(instant, ROME)).toBe("00:30");
    // 00:30 Rome in January is 23:30 UTC the previous day.
    expect(instant.toISOString().slice(0, 10)).toBe("2026-01-14");
  });

  it("handles a zone with a half-hour offset", () => {
    const instant = wallTimeInZone("2026-06-10", 14, 0, "Asia/Kolkata");
    expect(localTime(instant, "Asia/Kolkata")).toBe("14:00");
  });
});
