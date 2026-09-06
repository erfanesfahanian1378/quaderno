import { describe, expect, it } from "vitest";
import { mergeRectsByBaseline } from "@/components/viewer/annotations/useTextSelection";

/**
 * PHASE-06 acceptance criterion:
 *
 *   "Highlight a phrase spanning three pdf.js text runs → one visual bar, not
 *    three."
 *
 * pdf.js emits one span per text run, so this merging step is the whole
 * difference between a highlight that looks like a highlighter and one that
 * looks like a bug.
 */

describe("mergeRectsByBaseline", () => {
  it("merges three runs on one line into a single bar", () => {
    const runs = [
      { x: 100, y: 200, width: 40, height: 14 },
      { x: 142, y: 200, width: 30, height: 14 },
      { x: 174, y: 200, width: 50, height: 14 },
    ];

    const merged = mergeRectsByBaseline(runs);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ x: 100, y: 200, width: 124, height: 14 });
  });

  it("keeps separate lines separate", () => {
    const runs = [
      { x: 100, y: 200, width: 80, height: 14 },
      { x: 100, y: 220, width: 60, height: 14 },
    ];

    expect(mergeRectsByBaseline(runs)).toHaveLength(2);
  });

  it("merges runs of slightly different sizes that share a baseline", () => {
    // A bold word among regular text: taller box, same baseline.
    const runs = [
      { x: 100, y: 201, width: 40, height: 13 },
      { x: 141, y: 199, width: 30, height: 15 },
    ];

    const merged = mergeRectsByBaseline(runs);

    expect(merged).toHaveLength(1);
    // The bar covers the full height of both runs.
    expect(merged[0]!.y).toBe(199);
    expect(merged[0]!.height).toBe(15);
  });

  it("handles a three-line selection", () => {
    const runs = [
      { x: 300, y: 100, width: 100, height: 14 },
      { x: 100, y: 120, width: 300, height: 14 },
      { x: 100, y: 140, width: 150, height: 14 },
    ];

    const merged = mergeRectsByBaseline(runs);

    expect(merged).toHaveLength(3);
    expect(merged.map((rect) => rect.y)).toEqual([100, 120, 140]);
  });

  it("returns nothing for an empty selection", () => {
    expect(mergeRectsByBaseline([])).toEqual([]);
  });

  it("does not care what order the runs arrive in", () => {
    const forwards = [
      { x: 100, y: 200, width: 40, height: 14 },
      { x: 142, y: 200, width: 30, height: 14 },
    ];
    const backwards = [...forwards].reverse();

    expect(mergeRectsByBaseline(backwards)).toEqual(
      mergeRectsByBaseline(forwards),
    );
  });
});
