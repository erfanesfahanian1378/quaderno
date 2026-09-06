"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { cropBoxFromView, renderedSize, type PageGeometry } from "./coords";
import { cn } from "@/lib/cn";

/**
 * One page: the exact three-layer stack from ANNOTATION_ENGINE.md §1.
 *
 *   1. <canvas>      pdf.js render — the page pixels
 *   2. .text-layer   transparent positioned spans; this is what makes text
 *                    selectable and therefore highlightable
 *   3. <svg>         annotations, viewBox "0 0 1 1", preserveAspectRatio none
 *
 * The SVG's viewBox is the whole reason coordinates are normalised: an
 * annotation at x = 0.5 sits at the centre at every zoom, on every screen,
 * with no recomputation on resize. Zoom changes the container's pixel size and
 * nothing else.
 */

export type PdfPageProps = {
  pageNumber: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  scale: number;
  rotation: number;
  /** Off-window pages render a correctly-sized placeholder instead. */
  active: boolean;
  onGeometry?: (geometry: PageGeometry) => void;
  children?: (geometry: PageGeometry) => React.ReactNode;
  label?: string;
};

export function PdfPage({
  pageNumber,
  getPage,
  scale,
  rotation,
  active,
  onGeometry,
  children,
  label,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<PageGeometry | null>(null);
  const renderTask = useRef<{ cancel: () => void } | null>(null);

  // Resolve the page's geometry as soon as it is known, even if it is not in
  // the render window yet — the placeholder needs the right aspect ratio or
  // the scrollbar jumps when it finally renders.
  useEffect(() => {
    let cancelled = false;

    void getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const next: PageGeometry = {
          cropBox: cropBoxFromView(page.view),
          rotation,
          scale,
          devicePixelRatio:
            typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
        };
        setGeometry(next);
        onGeometry?.(next);
      })
      .catch(() => {
        /* A page that will not resolve renders as a placeholder. */
      });

    return () => {
      cancelled = true;
    };
    // onGeometry is intentionally excluded: callers pass an inline function
    // and re-resolving the page on every parent render would thrash pdf.js.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getPage, pageNumber, rotation, scale]);

  useEffect(() => {
    if (!active || !geometry) return;

    let cancelled = false;

    void (async () => {
      const page = await getPage(pageNumber);
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const viewport = page.getViewport({ scale, rotation });
      const outputScale = window.devicePixelRatio || 1;

      // The backing store is at device resolution; the CSS box is not. Skip
      // this and the page looks soft on a retina screen. pdf.js v6 takes the
      // canvas itself and an extra transform, rather than a pre-transformed
      // context.
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      renderTask.current?.cancel();
      const task = page.render({
        canvas,
        viewport,
        ...(outputScale !== 1
          ? { transform: [outputScale, 0, 0, outputScale, 0, 0] }
          : {}),
      });
      renderTask.current = task;

      try {
        await task.promise;
      } catch {
        // A cancelled render is normal during fast scrolling.
        return;
      }

      if (cancelled) return;

      // The text layer. Without it there is no selection, and without
      // selection there is no highlighting.
      const container = textLayerRef.current;
      if (container) {
        container.replaceChildren();
        try {
          const pdfjs = await import("pdfjs-dist");
          const textContent = await page.getTextContent();
          if (cancelled) return;

          const textLayer = new pdfjs.TextLayer({
            textContentSource: textContent,
            container,
            viewport,
          });
          await textLayer.render();
        } catch {
          // A page with no text layer (a scan) simply has nothing to select;
          // the rectangle-highlight fallback covers it.
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask.current?.cancel();
      renderTask.current = null;
    };
  }, [active, geometry, getPage, pageNumber, rotation, scale]);

  // Release the canvas when the page leaves the render window, so memory does
  // not grow monotonically while scrolling a 200-page document.
  useEffect(() => {
    if (active) return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    textLayerRef.current?.replaceChildren();
  }, [active]);

  const size = geometry
    ? renderedSize(geometry)
    : { width: 595 * scale, height: 842 * scale };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        data-page={pageNumber}
        className={cn(
          "page-sheet relative overflow-hidden",
          !active && "bg-surface",
        )}
        style={
          {
            width: size.width,
            height: size.height,
            // pdf.js sizes every text span with
            // `calc(var(--scale-factor) * Npx)`. Without this the text layer
            // is offset from the canvas and selection lands on the wrong
            // words.
            "--scale-factor": scale,
          } as React.CSSProperties
        }
      >
        <canvas ref={canvasRef} className="block" />

        <div
          ref={textLayerRef}
          className="textLayer absolute inset-0 select-text"
          aria-hidden={!active}
        />

        {/* Layer 3: annotations. Empty here; PHASE-06 fills it. */}
        {geometry && children ? children(geometry) : null}
      </div>

      <span className="text-caption text-ink-3">{label ?? pageNumber}</span>
    </div>
  );
}
