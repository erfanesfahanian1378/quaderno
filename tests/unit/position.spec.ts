import { describe, expect, it } from "vitest";
import {
  comparePositions,
  needsRenumber,
  positionBetween,
  renumber,
} from "@/server/services/composition/position";

/**
 * PHASE-07 acceptance criterion: "10,000 random insertions never collide and
 * never produce an out-of-order read — property test."
 */

describe("positionBetween", () => {
  it("starts an empty document at 1", () => {
    expect(positionBetween(null, null)).toBe("1");
  });

  it("appends one past the last", () => {
    expect(positionBetween("1", null)).toBe("2");
    expect(positionBetween("7", null)).toBe("8");
  });

  it("prepends before the first", () => {
    expect(positionBetween(null, "1")).toBe("0.5");
    expect(positionBetween(null, "2")).toBe("1");
  });

  it("puts a page between two neighbours", () => {
    expect(positionBetween("1", "2")).toBe("1.5");
    expect(positionBetween("1.5", "2")).toBe("1.75");
    expect(positionBetween("3", "4")).toBe("3.5");
  });

  it("refuses when the neighbours are out of order", () => {
    expect(positionBetween("5", "2")).toBeNull();
    expect(positionBetween("2", "2")).toBeNull();
  });

  /**
   * The bug this module exists to avoid. In IEEE doubles, repeatedly averaging
   * toward the same neighbour stops producing a distinct value after ~50
   * insertions, and two leaves then collide on @@unique([documentId, position]).
   */
  it("keeps producing distinct values under repeated insertion at one spot", () => {
    let low = "1";
    const high = "2";
    const seen = new Set<string>([low, high]);

    for (let i = 0; i < 45; i += 1) {
      const next = positionBetween(low, high);
      if (next === null) break;

      expect(seen.has(next), `collided at insertion ${i}: ${next}`).toBe(false);
      expect(comparePositions(low, next)).toBe(-1);
      expect(comparePositions(next, high)).toBe(-1);

      seen.add(next);
      low = next;
    }

    // Decimal(30,15) gives about 45 halvings between 1 and 2 before the gap is
    // one unit in the last place; the point is that every one of them is
    // distinct and ordered, and that exhaustion is reported rather than
    // silently colliding.
    expect(seen.size).toBeGreaterThan(40);
  });

  it("reports exhaustion instead of returning a duplicate", () => {
    // Adjacent at the smallest representable step.
    expect(positionBetween("1", "1.000000000000001")).toBeNull();
  });
});

describe("10,000 random insertions", () => {
  it("never collide and never read out of order", () => {
    // Deterministic PRNG so a failure is reproducible.
    let seed = 0x2f6e2b1;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    let positions: string[] = ["1"];
    let renumbers = 0;

    for (let i = 0; i < 10_000; i += 1) {
      // Insert anywhere, including before the first and after the last.
      const at = Math.floor(random() * (positions.length + 1));
      const prev = at === 0 ? null : (positions[at - 1] ?? null);
      const next = at >= positions.length ? null : (positions[at] ?? null);

      const inserted = positionBetween(prev, next);

      if (inserted === null) {
        // The documented recovery path: renumber and carry on.
        positions = renumber(positions.length);
        renumbers += 1;
        continue;
      }

      positions.splice(at, 0, inserted);
    }

    // No duplicates — this is the unique-index guarantee.
    expect(new Set(positions).size).toBe(positions.length);

    // Strictly ascending — this is the ordered-read guarantee.
    for (let i = 1; i < positions.length; i += 1) {
      expect(
        comparePositions(positions[i - 1]!, positions[i]!),
        `out of order at ${i}: ${positions[i - 1]} then ${positions[i]}`,
      ).toBe(-1);
    }

    // A renumber is legitimate but should be rare; if this ever spikes, the
    // gap arithmetic has regressed.
    expect(renumbers).toBeLessThan(50);
  });
});

describe("needsRenumber", () => {
  it("is false for a healthy gap", () => {
    expect(needsRenumber("1", "2")).toBe(false);
    expect(needsRenumber("1", "1.001")).toBe(false);
  });

  it("is true once the gap collapses past 1e-9", () => {
    expect(needsRenumber("1", "1.0000000001")).toBe(true);
    expect(needsRenumber("1", "1")).toBe(true);
  });
});

describe("renumber", () => {
  it("returns evenly spaced positions", () => {
    expect(renumber(4)).toEqual(["1", "2", "3", "4"]);
  });
});
