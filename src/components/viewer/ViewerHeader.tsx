"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ChevronIcon } from "@/components/nav/icons";
import { ExportMenu } from "./ExportMenu";
import { SyncIndicator } from "./SyncIndicator";
import type { SyncState } from "@/lib/outbox/queue";
import type { ViewerDocument } from "./Viewer";

/**
 * The viewer's top bar.
 *
 * Desktop and mobile carry different content, per DESIGN_BRIEF §5.7:
 *
 *   desktop  back · title + breadcrumb · sync · export · pages · zoom
 *   mobile   back · title · sync · overflow
 *
 * That is not a nicety. Rendering the desktop set on a 390px screen wraps the
 * title onto three lines and pushes it underneath the zoom controls, which is
 * exactly what happened the first time this was opened on a phone.
 */
export function ViewerHeader({
  syncState,
  document: doc,
  pageNumber,
  pageCount,
  zoom,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  railOpen,
  onToggleRail,
}: {
  syncState: SyncState;
  document: ViewerDocument;
  pageNumber: number;
  pageCount: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  railOpen: boolean;
  onToggleRail: () => void;
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  return (
    <header className="relative flex shrink-0 items-center gap-2 border-b border-hairline bg-surface px-2 py-2 sm:gap-3 sm:px-3">
      <Link
        href="/library"
        aria-label="Back to library"
        className="grid size-10 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-subtle hover:text-ink"
      >
        <ChevronIcon className="size-5 rotate-180" />
      </Link>

      <div className="min-w-0 flex-1">
        {/* Serif in the viewer header — DESIGN_BRIEF §3.3. */}
        <h1 className="truncate font-reading text-h3 leading-tight text-ink">
          {doc.title}
        </h1>
        <p className="truncate text-caption text-ink-3">
          {pageNumber} of {pageCount}
          {/* The conversion notice is desktop-only; it is the first thing to
              go when there is no room, and the Info panel still carries it. */}
          {doc.conversionEngine === "libreoffice" ? (
            <span className="hidden sm:inline">
              {" "}
              · converted from {doc.originalName ?? "the original"}
            </span>
          ) : null}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <SyncIndicator state={syncState} />
        <ExportMenu documentId={doc.id} title={doc.title} />

        <button
          type="button"
          onClick={onToggleRail}
          aria-pressed={railOpen}
          className={cn(
            "hidden h-9 rounded-sm px-3 text-label lg:block",
            railOpen ? "bg-subtle text-ink" : "text-ink-2 hover:bg-subtle",
          )}
        >
          Pages
        </button>

        <div className="flex items-center gap-1 rounded-sm border border-hairline p-0.5">
          <button
            type="button"
            onClick={onZoomOut}
            aria-label="Zoom out"
            className="grid size-8 place-items-center rounded-sm text-ink-2 hover:bg-subtle hover:text-ink"
          >
            −
          </button>
          <button
            type="button"
            onClick={onFitWidth}
            title="Fit width"
            className="min-w-[52px] rounded-sm px-2 py-1 text-caption tabular text-ink-2 hover:bg-subtle hover:text-ink"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            aria-label="Zoom in"
            className="grid size-8 place-items-center rounded-sm text-ink-2 hover:bg-subtle hover:text-ink"
          >
            +
          </button>
        </div>
      </div>

      {/* Mobile: sync stays visible (it is the honesty indicator), the rest
          goes behind one overflow button. */}
      <div className="flex shrink-0 items-center gap-1 sm:hidden">
        <SyncIndicator state={syncState} />
        <button
          type="button"
          onClick={() => setOverflowOpen((open) => !open)}
          aria-expanded={overflowOpen}
          aria-haspopup="menu"
          aria-label="More"
          className="grid size-10 place-items-center rounded-sm text-ink-2 hover:bg-subtle hover:text-ink"
        >
          <span aria-hidden="true" className="text-h3 leading-none">
            ⋯
          </span>
        </button>
      </div>

      {overflowOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setOverflowOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-2 top-full z-50 mt-1 flex w-[240px] flex-col gap-1 rounded-md border border-hairline bg-surface p-2 shadow-e2 sm:hidden"
          >
            <div className="flex items-center justify-between gap-2 px-1 py-1">
              <span className="text-label text-ink-2">Zoom</span>
              <div className="flex items-center gap-1 rounded-sm border border-hairline p-0.5">
                <button
                  type="button"
                  onClick={onZoomOut}
                  aria-label="Zoom out"
                  className="grid size-9 place-items-center rounded-sm text-ink-2"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={onFitWidth}
                  className="min-w-[52px] px-1 text-caption tabular text-ink-2"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={onZoomIn}
                  aria-label="Zoom in"
                  className="grid size-9 place-items-center rounded-sm text-ink-2"
                >
                  +
                </button>
              </div>
            </div>

            <div className="px-1">
              <ExportMenu documentId={doc.id} title={doc.title} />
            </div>

            {doc.conversionEngine === "libreoffice" ? (
              <p className="px-1 pt-1 text-caption text-ink-3">
                Converted from {doc.originalName ?? "the original"} — layout may
                differ slightly. The original is kept.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </header>
  );
}
