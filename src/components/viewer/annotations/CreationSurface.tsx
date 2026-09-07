"use client";

import { useRef, useState } from "react";
import { rectToQuad, toNormalised, type PageGeometry } from "../coords";
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
  const [drag, setDrag] = useState<Drag | null>(null);

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
    if (tool === "text") {
      onTextBox(leafId, point.x, point.y);
      return;
    }

    if (tool === "comment") {
      onCommentPin(leafId, point.x, point.y);
      return;
    }

    // Drag tools do want capture: the gesture must keep working if the finger
    // leaves the page.
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerId.current = event.pointerId;
    setDrag({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointerId.current !== event.pointerId || !drag) return;
    const point = pointFrom(event);
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
      // A tap with the highlighter is not a mistake worth acting on.
      if (!moved) return;
      const found = textUnderDrag(event.currentTarget, current, geometry);
      if (found.quads.length > 0) {
        onHighlight(leafId, found.quads, found.text);
      }
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
      {drag && tool === "highlight" ? (
        <rect
          x={Math.min(drag.x1, drag.x2)}
          y={Math.min(drag.y1, drag.y2)}
          width={Math.abs(drag.x2 - drag.x1)}
          height={Math.abs(drag.y2 - drag.y1)}
          fill={previewColor}
          opacity={0.35}
        />
      ) : null}

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
 * Finds the text the drag crossed.
 *
 * Rather than asking the browser for a selection, this intersects the drag
 * rectangle with the text layer's spans directly. That is what makes
 * press-drag-release work identically with a finger, a pen and a mouse, and
 * it sidesteps the native selection UI entirely.
 *
 * Rects are then merged by line, for the same reason the selection path merges
 * them: pdf.js emits one span per text run, and three runs on one line must
 * become one bar, not three.
 */
function textUnderDrag(
  surface: SVGSVGElement,
  drag: Drag,
  geometry: PageGeometry,
): { quads: { x: number; y: number; w: number; h: number }[]; text: string } {
  const page = surface.parentElement;
  if (!page) return { quads: [], text: "" };

  const layer = page.querySelector(".textLayer");
  if (!layer) return { quads: [], text: "" };

  const pageRect = page.getBoundingClientRect();

  // The drag, back in CSS pixels relative to the page.
  const left = Math.min(drag.x1, drag.x2) * pageRect.width;
  const right = Math.max(drag.x1, drag.x2) * pageRect.width;
  const top = Math.min(drag.y1, drag.y2) * pageRect.height;
  const bottom = Math.max(drag.y1, drag.y2) * pageRect.height;

  // A thin horizontal swipe is the normal highlighter gesture, so give it
  // some vertical tolerance rather than demanding a pixel-perfect band.
  const padY = Math.max(4, (bottom - top) * 0.15);

  type Hit = {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
  };
  const hits: Hit[] = [];

  for (const node of layer.querySelectorAll("span")) {
    const text = node.textContent ?? "";
    if (!text.trim()) continue;

    const box = node.getBoundingClientRect();
    const x = box.left - pageRect.left;
    const y = box.top - pageRect.top;

    const overlapsX = x < right && x + box.width > left;
    const overlapsY = y < bottom + padY && y + box.height > top - padY;

    if (overlapsX && overlapsY) {
      hits.push({ x, y, width: box.width, height: box.height, text });
    }
  }

  if (hits.length === 0) return { quads: [], text: "" };

  // Merge by line, exactly as the selection path does.
  const lines: Hit[][] = [];
  for (const hit of hits.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((candidate) => {
      const first = candidate[0]!;
      const tolerance = Math.max(first.height, hit.height) * 0.4;
      return (
        Math.abs(first.y + first.height - (hit.y + hit.height)) <= tolerance
      );
    });
    if (line) line.push(hit);
    else lines.push([hit]);
  }

  const quads = lines.map((line) => {
    const x = Math.min(...line.map((hit) => hit.x));
    const right2 = Math.max(...line.map((hit) => hit.x + hit.width));
    const y = Math.min(...line.map((hit) => hit.y));
    const bottom2 = Math.max(...line.map((hit) => hit.y + hit.height));

    return rectToQuad(
      { x, y, width: right2 - x, height: bottom2 - y },
      geometry,
    );
  });

  const text = lines
    .map((line) => line.map((hit) => hit.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return { quads, text };
}
