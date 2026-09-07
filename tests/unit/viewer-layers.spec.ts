import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The layer stacking contract for a page. ANNOTATION_ENGINE.md §1 describes
 * three stacked layers but not their z-order, and getting it wrong is
 * completely silent:
 *
 *   The text layer covers the entire page. Given `z-index: 1` and nothing
 *   above it, every pen stroke, every eraser tap and every click on an
 *   existing mark lands on the text layer instead. The tool button highlights
 *   correctly, the cursor changes, and nothing happens — which is exactly how
 *   it was reported: "the highlight and pen can select but won't work".
 *
 * So the order is pinned here:
 *
 *   canvas            (auto)  the page pixels
 *   .textLayer        z-1     selection, and only while a text tool is active
 *   annotation marks  z-20    must be tappable to select or erase
 *   ink capture       z-30    must receive every pointer while drawing
 */

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("page layer stacking", () => {
  it("puts the text layer at z-1", () => {
    const css = read("src/styles/globals.css");
    const block = css.slice(css.indexOf(".textLayer {"));
    expect(block.slice(0, block.indexOf("}"))).toMatch(/z-index:\s*1\b/);
  });

  it("puts annotation marks above the text layer", () => {
    const source = read(
      "src/components/viewer/annotations/AnnotationLayer.tsx",
    );
    // The marks SVG and the HTML text boxes both need to clear z-1.
    expect(source).toMatch(/absolute inset-0 z-20 size-full/);
    expect(source).toMatch(/absolute z-20 cursor-pointer/);
  });

  it("puts the ink capture surface above everything on the page", () => {
    const source = read("src/components/viewer/Viewer.tsx");
    expect(source).toMatch(/absolute inset-0 z-30 size-full touch-none/);
  });

  it("makes the text layer inert while a drawing tool is active", () => {
    const source = read("src/components/viewer/PdfPage.tsx");
    // The whole point: a live text layer swallows every drawing pointer.
    expect(source).toMatch(/interaction === "text"/);
    expect(source).toMatch(/pointer-events-none select-none/);
  });

  it("only treats select and highlight as text tools", () => {
    const source = read("src/components/viewer/Viewer.tsx");
    expect(source).toMatch(
      /tool === "select" \|\| tool === "highlight"\s*\?\s*"text"\s*:\s*"draw"/,
    );
  });
});

describe("the toolbar fits a phone", () => {
  it("constrains every floating row to the viewport", () => {
    const source = read("src/components/viewer/annotations/Toolbar.tsx");
    // Five swatches with labels are wider than a phone; an overflowing row
    // puts the first and last colours out of reach.
    const constrained = source.match(/max-w-\[calc\(100vw-16px\)\]/g) ?? [];
    expect(constrained.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the highlighter labels, which carry the meaning", () => {
    const source = read("src/components/viewer/annotations/Toolbar.tsx");
    expect(source).toContain("labels[key]");
  });
});
