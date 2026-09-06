"use client";

import { useCallback, useEffect, useState } from "react";
import { rectToQuad, type PageGeometry } from "../coords";

/**
 * Text selection capture. ANNOTATION_ENGINE.md §3.
 *
 * The part that matters and is easy to get wrong: pdf.js emits **one span per
 * text run**, so a phrase spanning three runs produces three client rects with
 * the same baseline. Drawn as-is that is three separate bars with gaps. They
 * have to be merged by baseline first — this is a PHASE-06 acceptance
 * criterion, and it is the difference between a highlight that looks like a
 * highlighter and one that looks like a bug.
 */

export type SelectionCapture = {
  leafId: string;
  quads: { x: number; y: number; w: number; h: number }[];
  quotedText: string;
  /** Where to anchor the popover, in viewport coordinates. */
  anchor: { x: number; y: number };
  textAnchor: {
    pageIndex: number;
    exact: string;
    prefix: string;
    suffix: string;
  };
};

/** Rects within this fraction of a line height share a baseline. */
const BASELINE_TOLERANCE = 0.4;

export function mergeRectsByBaseline(
  rects: { x: number; y: number; width: number; height: number }[],
): { x: number; y: number; width: number; height: number }[] {
  if (rects.length === 0) return [];

  // Group by baseline (bottom edge), tolerant of sub-pixel differences and of
  // runs with slightly different font sizes on the same line.
  const lines: (typeof rects)[] = [];

  for (const rect of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((candidate) => {
      const first = candidate[0]!;
      const tolerance =
        Math.max(first.height, rect.height) * BASELINE_TOLERANCE;
      return (
        Math.abs(first.y + first.height - (rect.y + rect.height)) <= tolerance
      );
    });

    if (line) line.push(rect);
    else lines.push([rect]);
  }

  // One bar per line, spanning from the leftmost to the rightmost run.
  return lines.map((line) => {
    const left = Math.min(...line.map((rect) => rect.x));
    const right = Math.max(...line.map((rect) => rect.x + rect.width));
    const top = Math.min(...line.map((rect) => rect.y));
    const bottom = Math.max(...line.map((rect) => rect.y + rect.height));

    return { x: left, y: top, width: right - left, height: bottom - top };
  });
}

export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  geometryFor: (leafId: string) => PageGeometry | null,
  enabled: boolean,
) {
  const [selection, setSelection] = useState<SelectionCapture | null>(null);

  const capture = useCallback(() => {
    if (!enabled) return;

    const domSelection = window.getSelection();
    if (
      !domSelection ||
      domSelection.isCollapsed ||
      domSelection.rangeCount === 0
    ) {
      setSelection(null);
      return;
    }

    const range = domSelection.getRangeAt(0);
    const quotedText = domSelection.toString().trim();
    if (!quotedText) {
      setSelection(null);
      return;
    }

    // Which page is the selection on? Walk up to the nearest page element.
    let node: Node | null = range.commonAncestorContainer;
    let pageElement: HTMLElement | null = null;
    while (node) {
      if (node instanceof HTMLElement && node.dataset.leafId) {
        pageElement = node;
        break;
      }
      node = node.parentNode;
    }
    if (!pageElement) {
      setSelection(null);
      return;
    }

    const leafId = pageElement.dataset.leafId!;
    const geometry = geometryFor(leafId);
    if (!geometry) {
      setSelection(null);
      return;
    }

    const pageRect = pageElement.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        x: rect.x - pageRect.x,
        y: rect.y - pageRect.y,
        width: rect.width,
        height: rect.height,
      }));

    if (rects.length === 0) {
      setSelection(null);
      return;
    }

    const merged = mergeRectsByBaseline(rects);
    const quads = merged.map((rect) => rectToQuad(rect, geometry));

    const first = merged[0]!;

    setSelection({
      leafId,
      quads,
      quotedText,
      anchor: {
        x: pageRect.x + first.x + first.width / 2,
        y: pageRect.y + first.y,
      },
      // The anchor is what lets a mark survive re-conversion: a background job
      // re-locates it by searching prefix + exact + suffix in the new page
      // text (ANNOTATION_ENGINE.md §3).
      textAnchor: {
        pageIndex: Number(pageElement.dataset.pageIndex ?? "0"),
        exact: quotedText,
        prefix: textAround(range, "before"),
        suffix: textAround(range, "after"),
      },
    });
  }, [enabled, geometryFor]);

  useEffect(() => {
    if (!enabled) return;

    // Debounced: selectionchange fires on every pointermove during a drag.
    let timer: ReturnType<typeof setTimeout>;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(capture, 120);
    };

    document.addEventListener("selectionchange", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [capture, enabled]);

  const clear = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  return { selection, clear };
}

/** Up to 32 characters either side, for re-anchoring after a re-conversion. */
function textAround(range: Range, side: "before" | "after"): string {
  const container = range.commonAncestorContainer;
  const text = container.textContent ?? "";
  const selected = range.toString();
  const index = text.indexOf(selected);
  if (index < 0) return "";

  return side === "before"
    ? text.slice(Math.max(0, index - 32), index)
    : text.slice(index + selected.length, index + selected.length + 32);
}
