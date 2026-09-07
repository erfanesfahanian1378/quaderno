"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ⌘P, made to actually work against a virtualised viewer.
 *
 * useRenderWindow keeps three to five pages in the DOM. Printing in that
 * state gives you a stack of blank sheets, and the browser gives no hint that
 * anything went wrong. So this hook renders EVERY page, waits for the canvases
 * to finish painting, and only then calls window.print().
 *
 * The wait cannot happen inside a `beforeprint` listener — that event is
 * synchronous and no browser waits for a promise, so intercepting the keyboard
 * shortcut ourselves is the only way to get the ordering right.
 */

/**
 * Above this, rendering every page at once is a memory problem, not a wait.
 * A 400-page scan at full canvas resolution is gigabytes; the export job
 * exists for exactly this case and produces a better artefact anyway.
 */
export const PRINT_PAGE_LIMIT = 60;

const RENDER_TIMEOUT_MS = 30_000;

export function usePrint(
  containerRef: React.RefObject<HTMLElement | null>,
  pageCount: number,
) {
  const [rendering, setRendering] = useState(false);
  const busy = useRef(false);

  /** True while every page is force-mounted, so the caller can widen the window. */
  const [printAll, setPrintAll] = useState(false);

  const tooLong = pageCount > PRINT_PAGE_LIMIT;

  const print = useCallback(async () => {
    if (busy.current || tooLong) return;
    busy.current = true;
    setPrintAll(true);
    setRendering(true);

    try {
      await waitForCanvases(containerRef.current, RENDER_TIMEOUT_MS);
      // One more frame so the browser has laid out at the new heights before
      // it snapshots the document for the print preview.
      await nextFrame();
      window.print();
    } finally {
      setRendering(false);
      /*
       * Chrome and Safari return from window.print() once the dialog closes;
       * Firefox returns immediately. Dropping the pages the instant print()
       * returns can therefore empty the document while Firefox is still
       * generating it, so unmount on afterprint and treat this as a fallback.
       */
      window.setTimeout(() => {
        setPrintAll(false);
        busy.current = false;
      }, 1000);
    }
  }, [containerRef, tooLong]);

  useEffect(() => {
    const onAfterPrint = () => {
      setPrintAll(false);
      busy.current = false;
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  // Intercept the shortcut so ⌘P goes through the render-first path rather
  // than printing whatever three pages happen to be mounted.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "p" && event.key !== "P") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey) return;
      event.preventDefault();
      void print();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [print]);

  return { print, rendering, printAll, tooLong, limit: PRINT_PAGE_LIMIT };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

/**
 * Resolve once every canvas in the container has been painted.
 *
 * A canvas that pdf.js has not drawn into yet has width 0 — that is the signal,
 * and it needs no cooperation from PdfPage. Note pages have no canvas at all
 * and are laid out synchronously, so they need no wait.
 */
async function waitForCanvases(
  container: HTMLElement | null,
  timeoutMs: number,
): Promise<void> {
  if (!container) return;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const canvases = [...container.querySelectorAll("canvas")];
    const pending = canvases.filter((canvas) => canvas.width === 0);
    if (pending.length === 0) return;

    if (Date.now() > deadline) {
      // Print what we have rather than refusing outright: a partial document
      // is recoverable, a dialog that never opens looks like a broken button.
      console.warn(
        `[print] ${pending.length} page(s) still rendering after ${timeoutMs}ms; printing anyway`,
      );
      return;
    }
    await nextFrame();
  }
}
