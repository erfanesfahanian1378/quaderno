import { describe, expect, it } from "vitest";
import {
  cropBoxFromView,
  normalisedToPdfPoint,
  pdfPointToNormalised,
  rectToQuad,
  renderedSize,
  toDevice,
  toNormalised,
  type PageGeometry,
} from "@/components/viewer/coords";

/**
 * The PHASE-05 acceptance criterion this file exists for:
 *
 *   "A placeholder rect drawn at normalised (0.5, 0.5) stays centred at 50%,
 *    100%, 400% zoom, on a rotated page, and on a page with a non-origin
 *    CropBox."
 *
 * Every one of those is a separate way to get the maths wrong, and each is
 * invisible until an annotation lands in the wrong place on somebody's phone.
 */

const A4 = cropBoxFromView([0, 0, 595, 842]);

function page(overrides: Partial<PageGeometry> = {}): PageGeometry {
  return {
    cropBox: A4,
    rotation: 0,
    scale: 1,
    devicePixelRatio: 1,
    ...overrides,
  };
}

describe("round trip", () => {
  it.each([0.5, 1, 2, 4])("survives at scale %s", (scale) => {
    const geometry = page({ scale });
    const original = { x: 0.37, y: 0.62 };

    const device = toDevice(original, geometry);
    const back = toNormalised(device, geometry);

    expect(back.x).toBeCloseTo(original.x, 10);
    expect(back.y).toBeCloseTo(original.y, 10);
  });

  it.each([0, 90, 180, 270])("survives at rotation %s", (rotation) => {
    const geometry = page({ rotation, scale: 1.5 });
    const original = { x: 0.2, y: 0.8 };

    const back = toNormalised(toDevice(original, geometry), geometry);

    expect(back.x).toBeCloseTo(original.x, 10);
    expect(back.y).toBeCloseTo(original.y, 10);
  });

  it("survives on a non-origin CropBox", () => {
    const geometry = page({
      cropBox: cropBoxFromView([20, 30, 615, 872]),
      scale: 2,
    });
    const original = { x: 0.4, y: 0.7 };

    const back = toNormalised(toDevice(original, geometry), geometry);

    expect(back.x).toBeCloseTo(original.x, 10);
    expect(back.y).toBeCloseTo(original.y, 10);
  });
});

describe("the centre stays centred", () => {
  const centre = { x: 0.5, y: 0.5 };

  it.each([0.5, 1, 4])("at %sx zoom", (scale) => {
    const geometry = page({ scale });
    const { width, height } = renderedSize(geometry);
    const device = toDevice(centre, geometry);

    expect(device.x).toBeCloseTo(width / 2, 10);
    expect(device.y).toBeCloseTo(height / 2, 10);
  });

  it.each([0, 90, 180, 270])("on a page rotated %s degrees", (rotation) => {
    const geometry = page({ rotation });
    const { width, height } = renderedSize(geometry);
    const device = toDevice(centre, geometry);

    expect(device.x).toBeCloseTo(width / 2, 10);
    expect(device.y).toBeCloseTo(height / 2, 10);
  });

  it("on a page with a non-origin CropBox", () => {
    const geometry = page({ cropBox: cropBoxFromView([20, 30, 615, 872]) });
    const { width, height } = renderedSize(geometry);
    const device = toDevice(centre, geometry);

    expect(device.x).toBeCloseTo(width / 2, 10);
    expect(device.y).toBeCloseTo(height / 2, 10);
  });
});

describe("renderedSize", () => {
  it("scales with zoom", () => {
    expect(renderedSize(page({ scale: 2 }))).toEqual({
      width: 1190,
      height: 1684,
    });
  });

  it("swaps the axes on a quarter turn", () => {
    const upright = renderedSize(page());
    const turned = renderedSize(page({ rotation: 90 }));

    expect(turned.width).toBeCloseTo(upright.height, 10);
    expect(turned.height).toBeCloseTo(upright.width, 10);
  });

  it("leaves a half turn the same size", () => {
    expect(renderedSize(page({ rotation: 180 }))).toEqual(renderedSize(page()));
  });

  it("measures a non-origin CropBox by its extent, not its corners", () => {
    // Same 595x842 extent, just offset.
    expect(
      renderedSize(page({ cropBox: cropBoxFromView([20, 30, 615, 872]) })),
    ).toEqual({ width: 595, height: 842 });
  });
});

describe("rotation puts a corner where you would expect", () => {
  it("maps the un-rotated top-left through each quarter turn", () => {
    const topLeft = { x: 0, y: 0 };

    // At 90°, the un-rotated top-left appears at the rendered top-RIGHT.
    const at90 = toDevice(topLeft, page({ rotation: 90 }));
    const size90 = renderedSize(page({ rotation: 90 }));
    expect(at90.x).toBeCloseTo(size90.width, 10);
    expect(at90.y).toBeCloseTo(0, 10);

    // At 180°, the bottom-right.
    const at180 = toDevice(topLeft, page({ rotation: 180 }));
    const size180 = renderedSize(page({ rotation: 180 }));
    expect(at180.x).toBeCloseTo(size180.width, 10);
    expect(at180.y).toBeCloseTo(size180.height, 10);
  });
});

describe("pdf user space", () => {
  /**
   * The classic bug: pdf.js is y-UP in user space, the DOM is y-DOWN. The flip
   * happens once, here.
   */
  it("flips the y axis", () => {
    // The BOTTOM of the page in PDF space is the TOP in normalised space.
    expect(pdfPointToNormalised({ x: 0, y: 0 }, A4)).toEqual({ x: 0, y: 1 });
    expect(pdfPointToNormalised({ x: 595, y: 842 }, A4)).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("is relative to the CropBox, not the origin", () => {
    const offset = cropBoxFromView([100, 200, 695, 1042]);
    // The CropBox's own bottom-left corner.
    expect(pdfPointToNormalised({ x: 100, y: 200 }, offset)).toEqual({
      x: 0,
      y: 1,
    });
  });

  it("round-trips back to user space", () => {
    const offset = cropBoxFromView([100, 200, 695, 1042]);
    const original = { x: 0.3, y: 0.65 };

    const back = pdfPointToNormalised(
      normalisedToPdfPoint(original, offset),
      offset,
    );

    expect(back.x).toBeCloseTo(original.x, 10);
    expect(back.y).toBeCloseTo(original.y, 10);
  });
});

describe("rectToQuad", () => {
  it("normalises a DOM rect", () => {
    const geometry = page({ scale: 1 });
    const quad = rectToQuad(
      { x: 59.5, y: 84.2, width: 119, height: 16.84 },
      geometry,
    );

    expect(quad.x).toBeCloseTo(0.1, 6);
    expect(quad.y).toBeCloseTo(0.1, 6);
    expect(quad.w).toBeCloseTo(0.2, 6);
    expect(quad.h).toBeCloseTo(0.02, 6);
  });

  it("keeps width and height positive through a rotation", () => {
    for (const rotation of [0, 90, 180, 270]) {
      const quad = rectToQuad(
        { x: 100, y: 100, width: 50, height: 20 },
        page({ rotation }),
      );
      expect(quad.w).toBeGreaterThan(0);
      expect(quad.h).toBeGreaterThan(0);
    }
  });
});

describe("clamping", () => {
  it("keeps a drag that left the page inside it", () => {
    const geometry = page();
    const { width } = renderedSize(geometry);

    expect(toNormalised({ x: -50, y: -50 }, geometry)).toEqual({ x: 0, y: 0 });
    expect(toNormalised({ x: width * 2, y: 0 }, geometry).x).toBe(1);
  });
});
