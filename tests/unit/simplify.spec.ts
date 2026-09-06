import { describe, expect, it } from "vitest";
import {
  RDP_EPSILON,
  round,
  simplify,
  toSmoothPath,
  type Point,
} from "@/components/viewer/ink/simplify";

/**
 * PHASE-06 acceptance criterion: "a 3-second scribble stores fewer than 120
 * points".
 */

describe("simplify", () => {
  it("leaves a one- or two-point stroke alone", () => {
    expect(simplify([[0.1, 0.1]])).toHaveLength(1);
    expect(
      simplify([
        [0.1, 0.1],
        [0.2, 0.2],
      ]),
    ).toHaveLength(2);
  });

  it("collapses a straight line to its endpoints", () => {
    const line: Point[] = Array.from({ length: 100 }, (_, i) => [i / 100, 0.5]);
    expect(simplify(line)).toEqual([
      [0, 0.5],
      [0.99, 0.5],
    ]);
  });

  it("keeps a corner", () => {
    const corner: Point[] = [
      [0, 0],
      [0.25, 0],
      [0.5, 0],
      [0.5, 0.25],
      [0.5, 0.5],
    ];
    const simplified = simplify(corner);

    // The corner point survives; the collinear ones do not.
    expect(simplified).toContainEqual([0.5, 0]);
    expect(simplified.length).toBeLessThan(corner.length);
  });

  it("always keeps the first and last point", () => {
    const wobble: Point[] = Array.from({ length: 50 }, (_, i) => [
      i / 50,
      0.5 + Math.sin(i) * 0.0001,
    ]);
    const simplified = simplify(wobble);

    expect(simplified[0]).toEqual(wobble[0]);
    expect(simplified[simplified.length - 1]).toEqual(
      wobble[wobble.length - 1],
    );
  });

  /** The acceptance criterion, with a realistic hand-drawn shape. */
  it("takes a 3-second scribble under 120 points", () => {
    // ~200 Hz pointer events over 3 seconds is ~600 points.
    const scribble: Point[] = Array.from({ length: 600 }, (_, i) => {
      const t = i / 600;
      return [
        0.2 + t * 0.6 + Math.sin(t * 24) * 0.02,
        0.5 + Math.sin(t * 14) * 0.08,
      ] as Point;
    });

    const simplified = simplify(scribble);

    expect(scribble.length).toBe(600);
    expect(simplified.length).toBeLessThan(120);
    // But not so aggressive that the shape is gone.
    expect(simplified.length).toBeGreaterThan(10);
  });

  it("does not move the stroke", () => {
    const scribble: Point[] = Array.from({ length: 300 }, (_, i) => {
      const t = i / 300;
      return [0.1 + t * 0.8, 0.5 + Math.sin(t * 10) * 0.1] as Point;
    });

    const simplified = simplify(scribble);

    // Every kept point is one of the originals — RDP selects, never invents.
    for (const point of simplified) {
      expect(scribble).toContainEqual(point);
    }
  });

  it("handles a stroke that doubles back on itself", () => {
    const there: Point[] = Array.from({ length: 50 }, (_, i) => [i / 50, 0.5]);
    const back: Point[] = Array.from({ length: 50 }, (_, i) => [
      1 - i / 50,
      0.5,
    ]);
    expect(() => simplify([...there, ...back])).not.toThrow();
  });

  it("does not blow the stack on a very long stroke", () => {
    const long: Point[] = Array.from({ length: 20_000 }, (_, i) => [
      i / 20_000,
      0.5 + Math.sin(i / 50) * 0.1,
    ]);
    expect(() => simplify(long)).not.toThrow();
  });

  it("uses the documented epsilon", () => {
    expect(RDP_EPSILON).toBe(0.0008);
  });
});

describe("toSmoothPath", () => {
  it("returns nothing for no points", () => {
    expect(toSmoothPath([])).toBe("");
  });

  it("draws a single tap as a dot", () => {
    expect(toSmoothPath([[0.5, 0.5]])).toBe("M 0.5 0.5 L 0.5 0.5");
  });

  it("draws two points as a line", () => {
    expect(
      toSmoothPath([
        [0, 0],
        [1, 1],
      ]),
    ).toBe("M 0 0 L 1 1");
  });

  it("emits cubic curves for three or more points", () => {
    const path = toSmoothPath([
      [0, 0],
      [0.5, 0.5],
      [1, 0],
    ]);
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path).toContain("C ");
  });

  it("starts at the first point and ends at the last", () => {
    const points: Point[] = [
      [0.1, 0.2],
      [0.4, 0.6],
      [0.7, 0.3],
      [0.9, 0.8],
    ];
    const path = toSmoothPath(points);

    expect(path.startsWith("M 0.1 0.2")).toBe(true);
    expect(path.endsWith("0.9 0.8")).toBe(true);
  });
});

describe("round", () => {
  it("trims coordinates to sub-pixel precision", () => {
    expect(round([[0.123456789, 0.987654321]])).toEqual([[0.123457, 0.987654]]);
  });
});
