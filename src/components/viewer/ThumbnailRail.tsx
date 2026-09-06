"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { cn } from "@/lib/cn";
import { PlusIcon } from "@/components/nav/icons";
import type { ViewerLeaf } from "./Viewer";

/**
 * The 180px page rail. Note pages are visually distinct — a folded corner and
 * a warmer surface — so the user can see at a glance where their own pages sit
 * among the teacher's (DESIGN_BRIEF §5.7).
 */
export function ThumbnailRail({
  leaves,
  activeIndex,
  onJump,
  getPage,
  ready,
  onInsertAfter,
}: {
  leaves: ViewerLeaf[];
  activeIndex: number;
  onJump: (index: number) => void;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  ready: boolean;
  /** null inserts before the first page. */
  onInsertAfter: (leafId: string | null) => void;
}) {
  return (
    <nav
      aria-label="Pages"
      className="hidden w-[var(--thumb-rail-width)] shrink-0 overflow-y-auto border-r border-hairline bg-surface p-2 lg:block"
    >
      <ol className="flex flex-col gap-1">
        <InsertHere onInsert={() => onInsertAfter(null)} first />

        {leaves.map((leaf, index) => {
          const pageNumber = index + 1;
          const active = pageNumber === activeIndex;

          return (
            <li key={leaf.id}>
              <button
                type="button"
                onClick={() => onJump(pageNumber)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "block w-full rounded-sm p-1 text-left transition-colors duration-[120ms]",
                  active ? "bg-accent-soft" : "hover:bg-subtle",
                )}
              >
                {leaf.kind === "NOTE_PAGE" ? (
                  <NoteThumb label={leaf.label} />
                ) : (
                  <SourceThumb
                    pageNumber={(leaf.sourcePageIndex ?? 0) + 1}
                    getPage={getPage}
                    ready={ready}
                  />
                )}

                <span className="mt-1 block text-center text-caption text-ink-3">
                  {pageNumber}
                </span>
              </button>

              {/*
                The insert affordance. This is the product's core promise made
                visible: your page, between the teacher's pages.
              */}
              <InsertHere onInsert={() => onInsertAfter(leaf.id)} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A real pdf.js render at thumbnail scale — cheap, and honest about content. */
function SourceThumb({
  pageNumber,
  getPage,
  ready,
}: {
  pageNumber: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  ready: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      const page = await getPage(pageNumber);
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      // A fixed 150px width keeps every thumbnail the same cost regardless of
      // the document's page size.
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 150 / base.width });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      try {
        await page.render({ canvas, viewport }).promise;
      } catch {
        // A cancelled thumbnail render during fast scroll is normal.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getPage, pageNumber, ready]);

  return (
    <div className="overflow-hidden rounded-[2px] border border-hairline bg-surface">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}

/** The user's own page: paper texture and a folded corner. */
function NoteThumb({ label }: { label: string | null }) {
  return (
    <div className="relative aspect-[595/842] overflow-hidden rounded-[2px] border border-hairline bg-subtle">
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 size-4 bg-inset"
        style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
      />
      <div className="flex h-full flex-col justify-center gap-1 px-2">
        {[70, 90, 55, 80].map((width, index) => (
          <div
            key={index}
            className="h-[2px] rounded-full bg-hairline-strong"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
      {label ? (
        <span className="absolute inset-x-1 bottom-1 truncate text-center text-[9px] text-ink-3">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** A hairline that becomes a + on hover, between any two thumbnails. */
function InsertHere({
  onInsert,
  first = false,
}: {
  onInsert: () => void;
  first?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group relative flex h-4 items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onInsert}
        aria-label={first ? "Insert a page at the start" : "Insert a page here"}
        title="Insert a page here"
        className="flex w-full items-center gap-1 px-1"
      >
        <span
          className={cn(
            "h-px flex-1 transition-colors duration-[120ms]",
            hovered ? "bg-accent" : "bg-transparent",
          )}
        />
        <span
          className={cn(
            "grid size-4 place-items-center rounded-full transition-opacity duration-[120ms]",
            hovered ? "bg-accent text-accent-on opacity-100" : "opacity-0",
          )}
        >
          <PlusIcon className="size-3" />
        </span>
        <span
          className={cn(
            "h-px flex-1 transition-colors duration-[120ms]",
            hovered ? "bg-accent" : "bg-transparent",
          )}
        />
      </button>
    </div>
  );
}
