/**
 * Stroke simplification and smoothing. ANNOTATION_ENGINE.md §4.
 *
 * A 3-second scribble is ~600 raw points. Stored raw, that is a fat payload,
 * a slow re-render and a heavy export. Ramer–Douglas–Peucker at
 * ε = 0.0008 normalised units (about 0.6 px on an A4 page at 100%) takes it to
 * ~60 points with no visible change.
 */

export type Point = [number, number];

export const RDP_EPSILON = 0.0008;

function perpendicularDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point,
): number {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // A degenerate segment: fall back to point distance.
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);

  const numerator = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1);
  return numerator / Math.hypot(dx, dy);
}

/** Ramer–Douglas–Peucker, iterative so a long stroke cannot blow the stack. */
export function simplify(points: Point[], epsilon = RDP_EPSILON): Point[] {
  if (points.length <= 2) return points;

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const segment = stack.pop();
    if (!segment) break;
    const [start, end] = segment;
    if (end <= start + 1) continue;

    let maxDistance = 0;
    let maxIndex = start;

    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(
        points[i]!,
        points[start]!,
        points[end]!,
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxDistance > epsilon) {
      keep[maxIndex] = true;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

/**
 * Catmull-Rom through the points, emitted as cubic Béziers. This is what turns
 * a simplified polyline back into something that reads as handwriting rather
 * than as a chain of straight segments.
 */
export function toSmoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const [x, y] = points[0]!;
    // A single tap is a dot, drawn as a degenerate curve so it still paints.
    return `M ${x} ${y} L ${x} ${y}`;
  }
  if (points.length === 2) {
    const [[x1, y1], [x2, y2]] = points as [Point, Point];
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const parts: string[] = [`M ${points[0]![0]} ${points[0]![1]}`];

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    // Catmull-Rom to Bézier: the control points are the neighbours' slopes,
    // scaled by the standard 1/6.
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`);
  }

  return parts.join(" ");
}

/** Rounds to a sane precision — 6 decimals is sub-pixel at any zoom. */
export function round(points: Point[], decimals = 6): Point[] {
  const factor = 10 ** decimals;
  return points.map(
    ([x, y]) =>
      [
        Math.round(x * factor) / factor,
        Math.round(y * factor) / factor,
      ] as Point,
  );
}

/**
 * The same curve, built as points arrive instead of all at once.
 *
 * `toSmoothPath` regenerates the whole `d` attribute from every point. During
 * a live stroke that ran on every pointer event, so the work per event grew
 * with the stroke — O(n²) over one line — and the browser re-parsed a string
 * that got longer with every sample. On a phone a long stroke visibly lagged
 * behind the finger.
 *
 * A Catmull-Rom segment `i` depends on points `i-1 … i+2`, so once two further
 * points exist it can never change again. Those segments are appended to a
 * committed prefix and never recomputed; only the last two are rebuilt each
 * frame. Per-frame work becomes proportional to the NEW points, not the total.
 *
 * The output is identical to `toSmoothPath` for the same input — asserted in
 * tests/unit/simplify.spec.ts, because "faster but subtly different curve"
 * would be a bad trade nobody noticed.
 */
export class SmoothPath {
  private readonly points: Point[] = [];
  private committed = "";
  /** Segments already folded into `committed`. */
  private done = 0;

  push(point: Point): void {
    this.points.push(point);
  }

  get length(): number {
    return this.points.length;
  }

  /** The `d` attribute for everything pushed so far. */
  toString(): string {
    const points = this.points;
    if (points.length === 0) return "";

    if (points.length === 1) {
      const [x, y] = points[0]!;
      return `M ${x} ${y} L ${x} ${y}`;
    }
    if (points.length === 2) {
      const [[x1, y1], [x2, y2]] = points as [Point, Point];
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    if (this.committed === "") {
      this.committed = `M ${points[0]![0]} ${points[0]![1]}`;
    }

    /*
     * Segment i reads p[i+2], so it is final only once that point exists —
     * i <= length - 3. Anything past that is rebuilt below and will change
     * as the stroke continues.
     */
    const settled = points.length - 3;
    while (this.done <= settled) {
      this.committed += ` ${segment(points, this.done)}`;
      this.done += 1;
    }

    let tail = "";
    for (let i = this.done; i < points.length - 1; i += 1) {
      tail += ` ${segment(points, i)}`;
    }

    return this.committed + tail;
  }
}

/** One Catmull-Rom span, expressed as a cubic Bézier. */
function segment(points: Point[], i: number): string {
  const p0 = points[Math.max(0, i - 1)]!;
  const p1 = points[i]!;
  const p2 = points[i + 1]!;
  const p3 = points[Math.min(points.length - 1, i + 2)]!;

  const c1x = p1[0] + (p2[0] - p0[0]) / 6;
  const c1y = p1[1] + (p2[1] - p0[1]) / 6;
  const c2x = p2[0] - (p3[0] - p1[0]) / 6;
  const c2y = p2[1] - (p3[1] - p1[1]) / 6;

  return `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
}
