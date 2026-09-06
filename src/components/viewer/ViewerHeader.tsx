"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { ChevronIcon } from "@/components/nav/icons";
import { SyncIndicator } from "./SyncIndicator";
import type { SyncState } from "@/lib/outbox/queue";
import type { ViewerDocument } from "./Viewer";

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
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-hairline bg-surface px-3 py-2">
      <Link
        href="/library"
        aria-label="Back to library"
        className="grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-subtle hover:text-ink"
      >
        <ChevronIcon className="size-5 rotate-180" />
      </Link>

      <div className="min-w-0 flex-1">
        {/* Serif in the viewer header — DESIGN_BRIEF §3.3. */}
        <h1 className="truncate font-reading text-h3 text-ink">{doc.title}</h1>
        <p className="text-caption text-ink-3">
          {pageNumber} of {pageCount}
          {doc.conversionEngine === "libreoffice" ? (
            <> · converted from {doc.originalName ?? "the original"}</>
          ) : null}
        </p>
      </div>

      <SyncIndicator state={syncState} />

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
    </header>
  );
}
