"use client";

import { useCallback, useRef } from "react";
import { toNormalised, type PageGeometry } from "../coords";
import { round, simplify, toSmoothPath, type Point } from "./simplify";

/**
 * Freehand ink capture. ANNOTATION_ENGINE.md §4.
 *
 * **Pointer Events only** — never mouse or touch events. That is what gets pen
 * pressure and palm rejection on an iPad for free, and it is the whole reason
 * the spec is emphatic about it.
 *
 * The latency rule: during a stroke, React is bypassed entirely. Points go
 * into a ref and the live path is written straight to the DOM on every
 * pointermove. A setState per move is ~16ms of reconciliation on a mid-range
 * Android and turns ink into a laggy smear. Target is under 16ms
 * input-to-paint.
 */

export type InkStroke = {
  w: number;
  points: Point[];
  pressure?: number[];
};

export function useInkCapture({
  enabled,
  width,
  palmRejection = true,
  onStrokeComplete,
}: {
  enabled: boolean;
  /** Normalised stroke width (fraction of page height). */
  width: number;
  palmRejection?: boolean;
  onStrokeComplete: (leafId: string, stroke: InkStroke) => void;
}) {
  const points = useRef<Point[]>([]);
  const pressures = useRef<number[]>([]);
  const activePointer = useRef<number | null>(null);
  const penIsDown = useRef(false);
  const livePath = useRef<SVGPathElement | null>(null);
  const geometryRef = useRef<PageGeometry | null>(null);
  const leafRef = useRef<string | null>(null);

  const onPointerDown = useCallback(
    (
      event: React.PointerEvent<SVGSVGElement>,
      leafId: string,
      geometry: PageGeometry,
    ) => {
      if (!enabled) return;

      /*
       * Palm rejection: while a pen is in contact, ignore touch contacts
       * entirely. This is the single behaviour that makes a tablet usable —
       * without it, the heel of your hand draws across the page.
       */
      if (palmRejection && event.pointerType === "touch" && penIsDown.current) {
        return;
      }
      // A touch contact with an active pen elsewhere is also a palm.
      if (
        palmRejection &&
        event.pointerType === "touch" &&
        activePointer.current !== null
      ) {
        return;
      }

      if (event.pointerType === "pen") penIsDown.current = true;

      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      activePointer.current = event.pointerId;
      geometryRef.current = geometry;
      leafRef.current = leafId;

      const rect = target.getBoundingClientRect();
      const point = toNormalised(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        geometry,
      );

      points.current = [[point.x, point.y]];
      // Mice report pressure 0; treat that as a normal press rather than
      // rendering an invisible stroke.
      pressures.current = [event.pressure > 0 ? event.pressure : 0.5];

      // The live stroke is a throwaway path, written directly. Never React.
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute(
        "style",
        `stroke-width:${width * geometry.scale * 842}px`,
      );
      target.appendChild(path);
      livePath.current = path;
    },
    [enabled, palmRejection, width],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!enabled) return;
      if (activePointer.current !== event.pointerId) return;

      const geometry = geometryRef.current;
      const path = livePath.current;
      if (!geometry || !path) return;

      const rect = event.currentTarget.getBoundingClientRect();

      /*
       * getCoalescedEvents gives every sample the OS captured between frames,
       * not just the one that fired. On a 120 Hz pen that is the difference
       * between a smooth line and a polygon.
       */
      const samples =
        typeof event.nativeEvent.getCoalescedEvents === "function"
          ? event.nativeEvent.getCoalescedEvents()
          : [event.nativeEvent];

      for (const sample of samples) {
        const point = toNormalised(
          { x: sample.clientX - rect.left, y: sample.clientY - rect.top },
          geometry,
        );
        points.current.push([point.x, point.y]);
        pressures.current.push(sample.pressure > 0 ? sample.pressure : 0.5);
      }

      // Direct DOM write. No setState, no re-render.
      path.setAttribute("d", toSmoothPath(points.current));
    },
    [enabled],
  );

  const finish = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (activePointer.current !== event.pointerId) return;

      const leafId = leafRef.current;
      const raw = points.current;

      // Clean up the throwaway path first, so an early return cannot leave it
      // stuck on the page.
      livePath.current?.remove();
      livePath.current = null;
      activePointer.current = null;
      if (event.pointerType === "pen") penIsDown.current = false;

      points.current = [];
      pressures.current = [];

      if (!leafId || raw.length === 0) return;

      // Simplify on release, not during: RDP over a growing array on every
      // move is the other way to make ink feel slow.
      const simplified = round(simplify(raw));

      onStrokeComplete(leafId, { w: width, points: simplified });
    },
    [onStrokeComplete, width],
  );

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
