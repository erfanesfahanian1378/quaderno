/**
 * The coordinate contract. ANNOTATION_ENGINE.md §2.
 *
 *   x, y ∈ [0,1], origin TOP-LEFT, relative to the page's UN-ROTATED CropBox.
 *
 * **This file is the only place coordinate maths may live.** Everywhere else
 * in the codebase, y grows downward and coordinates are normalised.
 *
 * Why normalised at all: the annotation layer is an SVG with
 * `viewBox="0 0 1 1"` and `preserveAspectRatio="none"`, so an annotation
 * stored at x = 0.5 sits at the horizontal centre at every zoom level, on
 * every screen, with **zero recomputation on resize**. Zoom changes exactly
 * one thing — the container's pixel size.
 *
 * The bug this file exists to prevent: pdf.js viewports are y-UP in PDF user
 * space and y-DOWN in CSS space. That conversion happens here, once, and
 * nowhere else.
 */

export type NormPoint = { x: number; y: number };
export type DevicePoint = { x: number; y: number };

export type CropBox = {
  /** PDF user-space coordinates, y-up, as pdf.js reports them. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type PageGeometry = {
  cropBox: CropBox;
  /** Page rotation in degrees: 0 | 90 | 180 | 270. View-only. */
  rotation: number;
  /** CSS pixels per PDF point at the current zoom. */
  scale: number;
  devicePixelRatio: number;
};

const norm = (value: number) => Math.min(1, Math.max(0, value));

export function cropWidth(box: CropBox): number {
  return Math.abs(box.x1 - box.x0);
}

export function cropHeight(box: CropBox): number {
  return Math.abs(box.y1 - box.y0);
}

/**
 * The rendered size of a page in CSS pixels, accounting for rotation. A page
 * rotated 90° is as wide as the un-rotated page is tall.
 */
export function renderedSize(page: PageGeometry): {
  width: number;
  height: number;
} {
  const width = cropWidth(page.cropBox) * page.scale;
  const height = cropHeight(page.cropBox) * page.scale;
  const quarterTurn = ((page.rotation % 360) + 360) % 360;

  return quarterTurn === 90 || quarterTurn === 270
    ? { width: height, height: width }
    : { width, height };
}

/**
 * Device (CSS pixel, relative to the page element's top-left) → normalised.
 *
 * `rotation` is undone here, so what gets stored is always in rotation-0
 * space. Rotating a page for viewing must never rewrite annotations.
 */
export function toNormalised(
  point: DevicePoint,
  page: PageGeometry,
): NormPoint {
  const { width, height } = renderedSize(page);
  if (width === 0 || height === 0) return { x: 0, y: 0 };

  // Fraction of the *rendered* (possibly rotated) box.
  const rx = point.x / width;
  const ry = point.y / height;

  const quarterTurn = ((page.rotation % 360) + 360) % 360;

  switch (quarterTurn) {
    case 90:
      // A point at the top-left of a 90°-rotated view is at the bottom-left
      // of the un-rotated page.
      return { x: norm(ry), y: norm(1 - rx) };
    case 180:
      return { x: norm(1 - rx), y: norm(1 - ry) };
    case 270:
      return { x: norm(1 - ry), y: norm(rx) };
    default:
      return { x: norm(rx), y: norm(ry) };
  }
}

/**
 * Normalised → device (CSS pixels, relative to the page element's top-left).
 *
 * `Leaf.rotation` is applied ONLY here. Stored geometry stays in rotation-0
 * space forever.
 */
export function toDevice(point: NormPoint, page: PageGeometry): DevicePoint {
  const { width, height } = renderedSize(page);
  const quarterTurn = ((page.rotation % 360) + 360) % 360;

  switch (quarterTurn) {
    case 90:
      return { x: (1 - point.y) * width, y: point.x * height };
    case 180:
      return { x: (1 - point.x) * width, y: (1 - point.y) * height };
    case 270:
      return { x: point.y * width, y: (1 - point.x) * height };
    default:
      return { x: point.x * width, y: point.y * height };
  }
}

/**
 * A rectangle from the DOM (a `getClientRects()` entry, already made relative
 * to the page element) → a normalised quad.
 */
export function rectToQuad(
  rect: { x: number; y: number; width: number; height: number },
  page: PageGeometry,
): { x: number; y: number; w: number; h: number } {
  const topLeft = toNormalised({ x: rect.x, y: rect.y }, page);
  const bottomRight = toNormalised(
    { x: rect.x + rect.width, y: rect.y + rect.height },
    page,
  );

  // Rotation can swap which corner is which, so normalise the ordering rather
  // than assuming top-left stays top-left.
  const x = Math.min(topLeft.x, bottomRight.x);
  const y = Math.min(topLeft.y, bottomRight.y);

  return {
    x,
    y,
    w: Math.abs(bottomRight.x - topLeft.x),
    h: Math.abs(bottomRight.y - topLeft.y),
  };
}

/**
 * pdf.js gives a page's CropBox as `view: [x0, y0, x1, y1]` in PDF user space
 * (y-up). Converting once, here, is what keeps the rest of the codebase
 * y-down.
 */
export function cropBoxFromView(view: number[]): CropBox {
  const [x0 = 0, y0 = 0, x1 = 612, y1 = 792] = view;
  return { x0, y0, x1, y1 };
}

/**
 * PDF user-space point (y-up, absolute) → normalised (y-down, CropBox-
 * relative). Used when reading annotations that already exist in a PDF.
 */
export function pdfPointToNormalised(
  point: { x: number; y: number },
  box: CropBox,
): NormPoint {
  const width = cropWidth(box);
  const height = cropHeight(box);
  if (width === 0 || height === 0) return { x: 0, y: 0 };

  return {
    x: norm((point.x - Math.min(box.x0, box.x1)) / width),
    // The y flip. This is the whole reason this function exists.
    y: norm(1 - (point.y - Math.min(box.y0, box.y1)) / height),
  };
}

/** Normalised → PDF user space, for baking annotations into an export. */
export function normalisedToPdfPoint(
  point: NormPoint,
  box: CropBox,
): { x: number; y: number } {
  const width = cropWidth(box);
  const height = cropHeight(box);

  return {
    x: Math.min(box.x0, box.x1) + point.x * width,
    y: Math.min(box.y0, box.y1) + (1 - point.y) * height,
  };
}

/** Clamp a normalised point into range, for a drag that left the page. */
export function clampNorm(point: NormPoint): NormPoint {
  return { x: norm(point.x), y: norm(point.y) };
}
