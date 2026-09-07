import { describe, expect, it } from "vitest";
import {
  INITIAL_EASE,
  previewIntervals,
  schedule,
  type CardState,
} from "@/server/services/review/sm2";

const TODAY = "2026-03-01";

const fresh = (): CardState => ({
  ease: INITIAL_EASE,
  intervalDays: 0,
  reps: 0,
  lapses: 0,
});

describe("SM-2", () => {
  it("puts a new card one day out on the first pass", () => {
    const next = schedule(fresh(), "good", TODAY);
    expect(next.intervalDays).toBe(1);
    expect(next.dueOn).toBe("2026-03-02");
    expect(next.reps).toBe(1);
  });

  it("uses the fixed six-day second interval", () => {
    const after = schedule(fresh(), "good", TODAY);
    const second = schedule(after, "good", "2026-03-02");
    expect(second.intervalDays).toBe(6);
    expect(second.dueOn).toBe("2026-03-08");
  });

  it("multiplies by ease from the third repetition", () => {
    let card: CardState = fresh();
    card = schedule(card, "good", TODAY);
    card = schedule(card, "good", TODAY);
    const third = schedule(card, "good", TODAY);

    // 6 days x the ease after two "good" grades.
    expect(third.intervalDays).toBe(Math.round(6 * third.ease));
    expect(third.intervalDays).toBeGreaterThan(6);
  });

  it("grows the interval monotonically while a card keeps passing", () => {
    let card: CardState = fresh();
    const intervals: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      card = schedule(card, "good", TODAY);
      intervals.push(card.intervalDays);
    }
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]!).toBeGreaterThanOrEqual(intervals[i - 1]!);
    }
    // A card answered well eight times should be months out, not days.
    expect(card.intervalDays).toBeGreaterThan(90);
  });

  it("sends a lapsed card back to one day and counts the lapse", () => {
    let card: CardState = fresh();
    for (let i = 0; i < 5; i += 1) card = schedule(card, "good", TODAY);
    expect(card.intervalDays).toBeGreaterThan(20);

    const lapsed = schedule(card, "again", TODAY);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.dueOn).toBe("2026-03-02");
  });

  it("keeps the ease penalty after a lapse, so a hard card stays frequent", () => {
    let card: CardState = fresh();
    card = schedule(card, "good", TODAY);
    const before = card.ease;

    const lapsed = schedule(card, "again", TODAY);
    expect(lapsed.ease).toBeLessThan(before);

    // Passing it again does not restore the ease it had before the lapse.
    const recovered = schedule(lapsed, "good", TODAY);
    expect(recovered.ease).toBeLessThan(before);
  });

  it("never drops ease below the floor, however often a card is failed", () => {
    let card: CardState = fresh();
    for (let i = 0; i < 40; i += 1) card = schedule(card, "again", TODAY);
    expect(card.ease).toBeCloseTo(1.3, 5);
    expect(card.intervalDays).toBe(1);
  });

  it("gives Easy a visibly different first step from Good", () => {
    // Plain SM-2 sends every first answer one day out, which makes all four
    // buttons read "1 day" and the choice look inert.
    const preview = previewIntervals(fresh(), TODAY);
    expect(preview.good).toBe(1);
    expect(preview.easy).toBe(4);
    expect(schedule(fresh(), "easy", TODAY).dueOn).toBe("2026-03-05");
  });

  it("orders the four buttons the way a learner expects", () => {
    let card: CardState = fresh();
    for (let i = 0; i < 4; i += 1) card = schedule(card, "good", TODAY);

    const preview = previewIntervals(card, TODAY);
    expect(preview.again).toBeLessThan(preview.hard);
    expect(preview.hard).toBeLessThan(preview.good);
    expect(preview.good).toBeLessThan(preview.easy);
  });

  it("never schedules a card in the past or on the same day", () => {
    let card: CardState = fresh();
    for (const grade of ["again", "hard", "good", "easy"] as const) {
      const next = schedule(card, grade, TODAY);
      expect(next.intervalDays).toBeGreaterThanOrEqual(1);
      expect(next.dueOn > TODAY).toBe(true);
      card = next;
    }
  });

  it("crosses a month boundary correctly", () => {
    const card = { ...fresh(), intervalDays: 6, reps: 2, ease: 2.5 };
    const next = schedule(card, "good", "2026-02-25");
    // February 2026 has 28 days.
    expect(next.dueOn).toBe("2026-03-12");
    expect(next.intervalDays).toBe(15);
  });

  it("crosses a leap day correctly", () => {
    const card = { ...fresh(), intervalDays: 0, reps: 0, ease: 2.5 };
    const next = schedule(card, "good", "2028-02-28");
    expect(next.dueOn).toBe("2028-02-29");
  });
});
