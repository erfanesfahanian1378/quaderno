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
    // The text box's classes are conditional now (it is draggable), so match
    // the invariant rather than one literal string: it is absolutely
    // positioned at z-20, whatever else it is.
    expect(source).toMatch(/"absolute z-20 [^"]*"/);
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

  it("keeps the text layer live for plain select only", () => {
    const source = read("src/components/viewer/Viewer.tsx");

    /*
     * Highlight used to be a text tool too, because it waited for the
     * browser's native selection. It now drags on its own surface, so it must
     * be in "draw" mode like the rest — leaving the text layer live for it
     * would put the native selection UI back on top of the gesture.
     */
    expect(source).toMatch(/tool === "select" \? "text" : "draw"/);
  });

  it("gives every non-pen tool a creation surface", () => {
    const source = read("src/components/viewer/Viewer.tsx");

    // The bug this guards: the buttons and the rendering existed for text
    // boxes, shapes and pins, but nothing created them, so the tools were
    // silently inert.
    for (const tool of ["highlight", "shape", "text", "comment"]) {
      expect(source).toContain(`tool === "${tool}"`);
    }
    expect(source).toContain("<CreationSurface");
  });

  it("handles the tap-placed tools before taking pointer capture", () => {
    const source = read(
      "src/components/viewer/annotations/CreationSurface.tsx",
    );

    const handler = source.slice(
      source.indexOf("const onPointerDown"),
      source.indexOf("const onPointerMove"),
    );

    // Capture binds the pointer to this surface for the rest of the gesture,
    // so the pointerup lands here rather than on the composer that just
    // opened — which blurs it and shuts the keyboard.
    const tapBranch = handler.indexOf('tool === "text"');
    const capture = handler.indexOf("setPointerCapture");

    expect(tapBranch).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(-1);
    expect(tapBranch).toBeLessThan(capture);
  });

  it("prevents the default that would steal focus back", () => {
    const source = read(
      "src/components/viewer/annotations/CreationSurface.tsx",
    );

    /*
     * pointerdown's default action generates the compatibility mouse events,
     * and mousedown's own default moves focus to whatever is under the
     * cursor. Without preventDefault, focusing the composer and then letting
     * the default run hands focus straight back to the page: the keyboard
     * opens and shuts in the same gesture.
     */
    const handler = source.slice(
      source.indexOf("const onPointerDown"),
      source.indexOf("const onPointerMove"),
    );
    expect(handler).toContain("event.preventDefault()");
  });

  it("keeps the composer mounted so focus can be synchronous", () => {
    const source = read("src/components/viewer/annotations/InlineComposer.tsx");

    // A mobile browser only opens and KEEPS the keyboard when focus() runs
    // synchronously inside the gesture. Creating the element on tap and
    // focusing it even one frame later does not work.
    expect(source).toContain("useImperativeHandle");
    expect(source).toMatch(/element\.focus\(\)/);
    expect(source).toContain("left: -9999");
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
