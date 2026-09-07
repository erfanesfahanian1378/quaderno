"use client";

import { useRef, useState } from "react";
import { toNormalised, type PageGeometry } from "../coords";
import type { Tool } from "./Toolbar";
import type { HighlightKey, InkKey } from "@/lib/tokens";

/**
 * The surface that CREATES annotations for every tool except the pen.
 *
 * Its reason for existing is a mobile one. The highlight tool originally did
 * nothing on its own — it waited for the browser's native text selection, and
 * on a phone that means long-press, drag the handles, dismiss Chrome's own
 * context menu (which covers our popover), and only then pick a colour. That
 * is not a highlighter. A highlighter is: press, drag across the words, done.
 *
 * So dragging with the highlight tool selects the text it crosses directly,
 * by intersecting the drag rectangle with the text layer's spans. No native
 * selection, no context menu, one gesture.
 *
 * Shapes drag. Text boxes and comment pins tap.
 */

export type CreationSurfaceProps = {
  tool: Tool;
  leafId: string;
  geometry: PageGeometry;
  highlightColor: HighlightKey;
  inkColor: InkKey;
  shape: "rect" | "ellipse" | "line" | "arrow";
  onHighlight: (
    leafId: string,
    quads: { x: number; y: number; w: number; h: number }[],
    quotedText: string,
  ) => void;
  onShape: (
    leafId: string,
    geometry: {
      shape: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      strokeW: number;
    },
  ) => void;
  onTextBox: (leafId: string, x: number, y: number) => void;
  onCommentPin: (leafId: string, x: number, y: number) => void;
};

type Drag = { x1: number; y1: number; x2: number; y2: number };
type Point = { x: number; y: number };

/** Nib height as a fraction of page height — about 14px on A4 at 100%. */
const HIGHLIGHTER_NIB = 0.017;

/**
 * A highlighter band along the path the finger actually took.
 *
 * The previous version snapped to text lines by intersecting the drag with
 * the text layer's spans. That is clever and it is wrong: on a phone your
 * finger wanders, the nearest line is often not the one you meant, and a
 * highlight that lands somewhere you did not point at is worse than no
 * highlight. A real highlighter marks where you drag it. So does this.
 *
 * Emitted as axis-aligned quads because that is what the HIGHLIGHT geometry
 * is, what the export bakes, and what a PDF /Highlight annotation uses. One
 * quad per sampled segment; at this sampling rate a diagonal reads as a
 * smooth band rather than a staircase.
 */
function bandFromPath(
  path: Point[],
  nib: number,
): { x: number; y: number; w: number; h: number }[] {
  if (path.length === 0) return [];

  const half = nib / 2;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  if (path.length === 1) {
    const only = path[0]!;
    return [
      {
        x: clamp(only.x - half),
        y: clamp(only.y - half),
        w: nib,
        h: nib,
      },
    ];
  }

  const quads: { x: number; y: number; w: number; h: number }[] = [];

  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1]!;
    const to = path[i]!;

    const left = Math.min(from.x, to.x);
    const right = Math.max(from.x, to.x);
    const top = Math.min(from.y, to.y) - half;
    const bottom = Math.max(from.y, to.y) + half;

    quads.push({
      x: clamp(left),
      y: clamp(top),
      // A perfectly vertical segment still needs width to be visible.
      w: Math.max(nib * 0.35, clamp(right) - clamp(left)),
      h: clamp(bottom) - clamp(top),
    });
  }

  // Bound the payload. A long swipe does not need a thousand rectangles.
  if (quads.length <= 240) return quads;

  const step = Math.ceil(quads.length / 240);
  return quads.filter((_, index) => index % step === 0);
}

export function CreationSurface({
  tool,
  leafId,
  geometry,
  highlightColor,
  inkColor,
  shape,
  onHighlight,
  onShape,
  onTextBox,
  onCommentPin,
}: CreationSurfaceProps) {
  const surfaceRef = useRef<SVGSVGElement>(null);
  const pointerId = useRef<number | null>(null);
  const path = useRef<Point[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [band, setBand] = useState<
    { x: number; y: number; w: number; h: number }[]
  >([]);

  const pointFrom = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return toNormalised(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      geometry,
    );
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = pointFrom(event);

    /*
     * Tap-only tools take NO pointer capture.
     *
     * Capturing keeps the pointer bound to this SVG for the rest of the
     * gesture, so the pointerup lands here rather than on the text box that
     * just mounted — the box is focused and then immediately blurred, commits
     * empty, and unmounts itself. The symptom is a tool that appears to do
     * nothing at all.
     */
    if (tool === "text" || tool === "comment") {
      /*
       * preventDefault is what makes the keyboard stay open.
       *
       * A pointerdown's default action generates the compatibility mouse
       * events, and mousedown's own default is to move focus to whatever is
       * under the cursor. So focusing the composer here and then letting the
       * default run hands focus straight back to the page — the keyboard
       * opens and shuts in the same gesture, which is exactly the reported
       * symptom.
       */
      event.preventDefault();

      if (tool === "text") onTextBox(leafId, point.x, point.y);
      else onCommentPin(leafId, point.x, point.y);
      return;
    }

    // Drag tools do want capture: the gesture must keep working if the finger
    // leaves the page.
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerId.current = event.pointerId;
    path.current = [{ x: point.x, y: point.y }];
    setBand([]);
    setDrag({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointerId.current !== event.pointerId || !drag) return;
    const point = pointFrom(event);

    if (tool === "highlight") {
      const last = path.current[path.current.length - 1];
      // Sample rather than record every event: a band does not need
      // sub-pixel resolution and the payload stays small.
      if (
        !last ||
        Math.hypot(point.x - last.x, point.y - last.y) > HIGHLIGHTER_NIB * 0.3
      ) {
        path.current.push({ x: point.x, y: point.y });
        setBand(bandFromPath(path.current, HIGHLIGHTER_NIB));
      }
    }

    setDrag({ ...drag, x2: point.x, y2: point.y });
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;

    const current = drag;
    setDrag(null);
    if (!current) return;

    const moved =
      Math.abs(current.x2 - current.x1) > 0.004 ||
      Math.abs(current.y2 - current.y1) > 0.004;

    if (tool === "highlight") {
      const quads = bandFromPath(path.current, HIGHLIGHTER_NIB);
      path.current = [];
      setBand([]);

      // A tap with the highlighter is not a mistake worth acting on.
      if (!moved || quads.length === 0) return;

      /*
       * The band is what gets drawn. The text under it is still captured, for
       * the annotations list, for search, and for the read-aloud panel — the
       * user does not see this and it costs one pass over the spans.
       */
      onHighlight(leafId, quads, textUnderQuads(event.currentTarget, quads));
      return;
    }

    if (tool === "shape" && moved) {
      onShape(leafId, {
        shape,
        x1: current.x1,
        y1: current.y1,
        x2: current.x2,
        y2: current.y2,
        strokeW: 0.002,
      });
    }
  };

  const previewColor =
    tool === "highlight" ? `var(--${highlightColor})` : `var(--${inkColor})`;

  return (
    <svg
      ref={surfaceRef}
      className="absolute inset-0 z-30 size-full touch-none"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        cursor: tool === "text" || tool === "comment" ? "copy" : "crosshair",
      }}
    >
      {/* Live preview, so the gesture is visible while it happens. */}
      {tool === "highlight" && band.length > 0
        ? band.map((quad, index) => (
            <rect
              key={index}
              x={quad.x}
              y={quad.y}
              width={quad.w}
              height={quad.h}
              fill={previewColor}
              opacity={0.4}
            />
          ))
        : null}

      {drag && tool === "shape" ? (
        <ShapePreview drag={drag} shape={shape} color={previewColor} />
      ) : null}
    </svg>
  );
}

function ShapePreview({
  drag,
  shape,
  color,
}: {
  drag: Drag;
  shape: string;
  color: string;
}) {
  const common = {
    stroke: color,
    fill: "none",
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke" as const,
  };

  if (shape === "rect") {
    return (
      <rect
        x={Math.min(drag.x1, drag.x2)}
        y={Math.min(drag.y1, drag.y2)}
        width={Math.abs(drag.x2 - drag.x1)}
        height={Math.abs(drag.y2 - drag.y1)}
        {...common}
      />
    );
  }

  if (shape === "ellipse") {
    return (
      <ellipse
        cx={(drag.x1 + drag.x2) / 2}
        cy={(drag.y1 + drag.y2) / 2}
        rx={Math.abs(drag.x2 - drag.x1) / 2}
        ry={Math.abs(drag.y2 - drag.y1) / 2}
        {...common}
      />
    );
  }

  return (
    <line x1={drag.x1} y1={drag.y1} x2={drag.x2} y2={drag.y2} {...common} />
  );
}

/**
 * The text sitting under a band, for the annotations list, search and the
 * read-aloud panel. Purely informational — it never moves the mark.
 */
function textUnderQuads(
  surface: SVGSVGElement,
  quads: { x: number; y: number; w: number; h: number }[],
): string {
  const page = surface.parentElement;
  const layer = page?.querySelector(".textLayer");
  if (!page || !layer) return "";

  const pageRect = page.getBoundingClientRect();
  const seen = new Set<string>();
  const found: { x: number; y: number; text: string }[] = [];

  for (const node of layer.querySelectorAll("span")) {
    const text = node.textContent ?? "";
    if (!text.trim()) continue;

    const box = node.getBoundingClientRect();
    const x = (box.left - pageRect.left) / pageRect.width;
    const y = (box.top - pageRect.top) / pageRect.height;
    const w = box.width / pageRect.width;
    const h = box.height / pageRect.height;

    const hit = quads.some(
      (quad) =>
        x < quad.x + quad.w &&
        x + w > quad.x &&
        y < quad.y + quad.h &&
        y + h > quad.y,
    );

    if (hit) {
      const key = `${Math.round(y * 1e4)}:${Math.round(x * 1e4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ x, y, text });
      }
    }
  }

  return found
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((entry) => entry.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
