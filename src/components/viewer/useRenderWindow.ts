"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Virtualised page rendering.
 *
 * Only a window of pages is kept rendered; everything else is a
 * correctly-sized placeholder so the scrollbar never jumps
 * (ARCHITECTURE.md §2). This is what keeps memory flat while scrolling a
 * 200-page handout, and it is the difference between 60fps and a slideshow on
 * a four-year-old Android.
 *
 * **One IntersectionObserver for the whole document**, not one per page —
 * ANNOTATION_ENGINE.md §9 is explicit, and 200 observers is its own problem.
 */

export const RENDER_WINDOW_DESKTOP = 5;
export const RENDER_WINDOW_MOBILE = 3;

export function useRenderWindow(
  containerRef: React.RefObject<HTMLElement | null>,
  pageCount: number,
) {
  const [visible, setVisible] = useState(1);
  const [windowSize, setWindowSize] = useState(RENDER_WINDOW_DESKTOP);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const update = () =>
      setWindowSize(
        window.innerWidth < 768 ? RENDER_WINDOW_MOBILE : RENDER_WINDOW_DESKTOP,
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageCount === 0) return;

    // Track how much of each page is on screen and pick the most visible one,
    // rather than "the first one intersecting" — which flickers between two
    // pages at a boundary.
    const ratios = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number(
            (entry.target as HTMLElement).dataset.pageIndex ?? "0",
          );
          ratios.set(page, entry.intersectionRatio);
        }

        let best = 1;
        let bestRatio = -1;
        for (const [page, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = page;
          }
        }
        setVisible(best);
      },
      {
        root: container,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    observerRef.current = observer;
    for (const element of container.querySelectorAll("[data-page-index]")) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [containerRef, pageCount]);

  const isInWindow = (pageNumber: number) =>
    Math.abs(pageNumber - visible) <= windowSize;

  return { visible, windowSize, isInWindow, setVisible };
}
