"use client";

import { memo } from "react";
import type { PageGeometry } from "../coords";
import type { Annotation } from "./store";
import { toSmoothPath, type Point } from "../ink/simplify";

/**
 * Layer 3 of the page stack: every annotation, in one SVG with
 * `viewBox="0 0 1 1"` and `preserveAspectRatio="none"`.
 *
 * That viewBox is the entire reason coordinates are normalised
 * (ANNOTATION_ENGINE.md §1): a mark stored at x = 0.5 sits at the horizontal
 * centre at every zoom level, on every screen, with **zero recomputation on
 * resize**. Zoom changes the container's pixel size and nothing else touches
 * this component.
 *
 * Memoised on (leafId, version) so panning never re-renders annotation
 * subtrees (§9).
 */
export const AnnotationLayer = memo(function AnnotationLayer({
  annotations,
  geometry,
  onSelect,
  selectedClientId,
}: {
  annotations: Annotation[];
  geometry: PageGeometry;
  onSelect?: (annotation: Annotation) => void;
  selectedClientId?: string | null;
}) {
  // Text boxes are HTML, not SVG: SVG text wrapping is not worth the pain
  // (ANNOTATION_ENGINE.md §1), so they are positioned in percentages over the
  // same box and inherit the same behaviour.
  const textBoxes = annotations.filter((a) => a.kind === "TEXT_BOX");
  const drawn = annotations.filter((a) => a.kind !== "TEXT_BOX");

  return (
    <>
      {/*
        z-20, above the text layer's z-1. Marks that sit *under* the text
        layer cannot be tapped — the eraser and mark selection both silently
        do nothing.
      */}
      <svg
        className="pointer-events-none absolute inset-0 z-20 size-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden={annotations.length === 0}
      >
        {[...drawn]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((annotation) => (
            <AnnotationShape
              key={annotation.clientId}
              annotation={annotation}
              geometry={geometry}
              selected={annotation.clientId === selectedClientId}
              onSelect={onSelect}
            />
          ))}
      </svg>

      {textBoxes.map((annotation) => (
        <TextBoxMark
          key={annotation.clientId}
          annotation={annotation}
          onSelect={onSelect}
        />
      ))}
    </>
  );
});

function AnnotationShape({
  annotation,
  geometry,
  selected,
  onSelect,
}: {
  annotation: Annotation;
  geometry: PageGeometry;
  selected: boolean;
  onSelect?: (annotation: Annotation) => void;
}) {
  const color = `var(--${annotation.color})`;

  switch (annotation.kind) {
    case "HIGHLIGHT":
    case "UNDERLINE":
    case "STRIKETHROUGH": {
      const quads =
        (annotation.geometry.quads as
          { x: number; y: number; w: number; h: number }[] | undefined) ?? [];

      return (
        <g
          className="pointer-events-auto cursor-pointer"
          onClick={() => onSelect?.(annotation)}
          // A screen reader can enumerate highlights with their quoted text
          // (ANNOTATION_ENGINE.md §10).
          role="mark"
          aria-label={
            annotation.quotedText
              ? `${annotation.kind.toLowerCase()}: ${annotation.quotedText}`
              : annotation.kind.toLowerCase()
          }
        >
          {quads.map((quad, index) => {
            if (annotation.kind === "HIGHLIGHT") {
              return (
                <rect
                  key={index}
                  x={quad.x}
                  y={quad.y}
                  width={quad.w}
                  height={quad.h}
                  fill={color}
                  opacity={annotation.opacity}
                  // Multiply keeps the text underneath readable rather than
                  // washing it out.
                  style={{ mixBlendMode: "multiply" }}
                />
              );
            }

            // Underline sits on the baseline; strikethrough at mid-height.
            const y =
              annotation.kind === "UNDERLINE"
                ? quad.y + quad.h * 0.92
                : quad.y + quad.h * 0.55;

            return (
              <line
                key={index}
                x1={quad.x}
                y1={y}
                x2={quad.x + quad.w}
                y2={y}
                stroke={color}
                strokeWidth={0.0018}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {selected
            ? quads.map((quad, index) => (
                <rect
                  key={`sel-${index}`}
                  x={quad.x}
                  y={quad.y}
                  width={quad.w}
                  height={quad.h}
                  fill="none"
                  stroke="var(--accent-base)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))
            : null}
        </g>
      );
    }

    case "INK": {
      const strokes =
        (annotation.geometry.strokes as
          { w: number; points: Point[] }[] | undefined) ?? [];

      return (
        <g
          className="pointer-events-auto cursor-pointer"
          onClick={() => onSelect?.(annotation)}
        >
          {strokes.map((stroke, index) => (
            <path
              key={index}
              d={toSmoothPath(stroke.points)}
              fill="none"
              stroke={color}
              // Width is normalised to page height, so it scales with zoom.
              strokeWidth={stroke.w}
              strokeLinecap="round"
              strokeLinejoin="round"
              // Without this the stroke is squashed by preserveAspectRatio.
              vectorEffect="non-scaling-stroke"
              style={{
                strokeWidth: stroke.w * geometry.scale * 842,
              }}
            />
          ))}
        </g>
      );
    }

    case "SHAPE": {
      const shape = annotation.geometry as unknown as {
        shape: "rect" | "ellipse" | "line" | "arrow";
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        strokeW: number;
      };

      const common = {
        stroke: color,
        fill: "none",
        strokeWidth: shape.strokeW * geometry.scale * 842,
        vectorEffect: "non-scaling-stroke" as const,
      };

      if (shape.shape === "rect") {
        return (
          <rect
            className="pointer-events-auto cursor-pointer"
            onClick={() => onSelect?.(annotation)}
            x={Math.min(shape.x1, shape.x2)}
            y={Math.min(shape.y1, shape.y2)}
            width={Math.abs(shape.x2 - shape.x1)}
            height={Math.abs(shape.y2 - shape.y1)}
            {...common}
          />
        );
      }

      if (shape.shape === "ellipse") {
        return (
          <ellipse
            className="pointer-events-auto cursor-pointer"
            onClick={() => onSelect?.(annotation)}
            cx={(shape.x1 + shape.x2) / 2}
            cy={(shape.y1 + shape.y2) / 2}
            rx={Math.abs(shape.x2 - shape.x1) / 2}
            ry={Math.abs(shape.y2 - shape.y1) / 2}
            {...common}
          />
        );
      }

      return (
        <g
          className="pointer-events-auto cursor-pointer"
          onClick={() => onSelect?.(annotation)}
        >
          <line
            x1={shape.x1}
            y1={shape.y1}
            x2={shape.x2}
            y2={shape.y2}
            {...common}
          />
          {shape.shape === "arrow" ? (
            <ArrowHead
              x1={shape.x1}
              y1={shape.y1}
              x2={shape.x2}
              y2={shape.y2}
              color={color}
            />
          ) : null}
        </g>
      );
    }

    case "COMMENT_PIN": {
      const pin = annotation.geometry as unknown as { x: number; y: number };
      return (
        <g
          className="pointer-events-auto cursor-pointer"
          onClick={() => onSelect?.(annotation)}
        >
          <circle cx={pin.x} cy={pin.y} r={0.012} fill="var(--accent-base)" />
          <circle cx={pin.x} cy={pin.y} r={0.005} fill="var(--accent-on)" />
        </g>
      );
    }

    default:
      return null;
  }
}

function ArrowHead({
  x1,
  y1,
  x2,
  y2,
  color,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 0.02;
  const spread = Math.PI / 7;

  return (
    <polygon
      points={[
        `${x2},${y2}`,
        `${x2 - size * Math.cos(angle - spread)},${y2 - size * Math.sin(angle - spread)}`,
        `${x2 - size * Math.cos(angle + spread)},${y2 - size * Math.sin(angle + spread)}`,
      ].join(" ")}
      fill={color}
    />
  );
}

function TextBoxMark({
  annotation,
  onSelect,
}: {
  annotation: Annotation;
  onSelect?: (annotation: Annotation) => void;
}) {
  const box = annotation.geometry as unknown as {
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    fontSize: number;
    align: "left" | "center" | "right";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(annotation)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect?.(annotation);
      }}
      className="absolute z-20 cursor-pointer whitespace-pre-wrap break-words"
      style={{
        // Percentages, so the box inherits the SVG's zoom behaviour without
        // any recomputation of its own.
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.w * 100}%`,
        // Font size is a fraction of page height, so text scales with zoom
        // instead of drifting.
        fontSize: `${box.fontSize * 100}cqh`,
        textAlign: box.align,
        color: `var(--${annotation.color})`,
      }}
    >
      {box.text}
    </div>
  );
}
