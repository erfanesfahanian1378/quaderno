import { describe, expect, it } from "vitest";
import { BOXES, boxOf, tally } from "@/server/services/review/leitner";
import { INITIAL_EASE, schedule } from "@/server/services/review/sm2";

/**
 * The boxes are a VIEW of the scheduler, so what matters is that they move the
 * way a physical Leitner box moves: forward when you know it, back to the
 * start when you do not.
 */
const fresh = () => ({
  ease: INITIAL_EASE,
  intervalDays: 0,
  reps: 0,
  lapses: 0,
});

describe("the Leitner box", () => {
  it("starts every new card in box 1", () => {
    expect(boxOf(fresh())).toBe(1);
  });

  it("keeps a never-reviewed card in box 1 whatever its interval", () => {
    // A new card has not earned a place further along. Showing it as "Known"
    // because a default interval happened to be large would undermine the
    // entire display.
    expect(boxOf({ intervalDays: 120, reps: 0 })).toBe(1);
  });

  it("moves a card up as it keeps being answered", () => {
    let card = fresh();
    const seen: number[] = [];

    for (let i = 0; i < 8; i += 1) {
      card = schedule(card, "good", "2026-03-01");
      seen.push(boxOf(card));
    }

    // Never goes backwards while the answers keep being right.
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
    expect(seen.at(-1)).toBe(5);
  });

  it("sends a forgotten card back to the first box", () => {
    let card = fresh();
    for (let i = 0; i < 8; i += 1) card = schedule(card, "good", "2026-03-01");
    expect(boxOf(card)).toBe(5);

    // The defining behaviour of a Leitner box.
    const lapsed = schedule(card, "again", "2026-03-01");
    expect(boxOf(lapsed)).toBe(1);
  });

  it("covers every interval with exactly one box", () => {
    for (const days of [0, 1, 2, 6, 7, 20, 21, 59, 60, 400]) {
      const box = boxOf({ intervalDays: days, reps: 3 });
      expect(box).toBeGreaterThanOrEqual(1);
      expect(box).toBeLessThanOrEqual(5);
    }
  });

  it("counts every card, including empty boxes", () => {
    const counts = tally([
      { intervalDays: 0, reps: 0 },
      { intervalDays: 3, reps: 2 },
      { intervalDays: 3, reps: 2 },
      { intervalDays: 90, reps: 9 },
    ]);

    expect(counts).toEqual({ 1: 1, 2: 2, 3: 0, 4: 0, 5: 1 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("names five boxes, in order, each harder than the last", () => {
    expect(BOXES).toHaveLength(5);
    for (let i = 1; i < BOXES.length; i += 1) {
      expect(BOXES[i]!.minInterval).toBeGreaterThan(BOXES[i - 1]!.minInterval);
    }
  });
});
