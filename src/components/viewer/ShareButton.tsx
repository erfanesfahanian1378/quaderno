"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { ShareLinks } from "./ShareLinks";
import { cn } from "@/lib/cn";

/**
 * "Share" as its own control, next to Export.
 *
 * The panel itself already existed — inside the right rail's Info tab, which
 * on a phone means tapping a button labelled "Marks and comments", finding a
 * third tab, and scrolling. Nobody looks for sharing under marks and
 * comments, so in practice the feature did not exist on mobile.
 *
 * It sits beside Export because they are the same intention: get this
 * document to someone who is not me. The rail keeps its copy — this is a
 * second door to one room, not a move.
 */
export function ShareButton({
  documentId,
  className,
  variant = "icon",
  onOpen,
}: {
  documentId: string;
  className?: string;
  /** `row` for the mobile overflow menu, where everything is a full-width row. */
  variant?: "icon" | "row";
  /** So the menu this was opened from can close itself. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // Otherwise the overflow menu is still sitting there when the sheet
          // is dismissed, which reads as the tap not having worked.
          onOpen?.();
        }}
        aria-haspopup="dialog"
        title="Share a link"
        className={cn(
          variant === "row"
            ? "flex h-10 w-full items-center gap-2 rounded-sm px-1 text-label text-ink-2 hover:bg-subtle hover:text-ink"
            : "flex h-9 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-label text-ink-2 transition-colors duration-[120ms] hover:bg-subtle hover:text-ink",
          className,
        )}
      >
        <ShareIcon />
        {variant === "row" ? (
          "Share a link"
        ) : (
          <span className="hidden sm:inline">Share</span>
        )}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Share this document"
      >
        <div className="p-4">
          <ShareLinks documentId={documentId} />
        </div>
      </Sheet>
    </>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
    </svg>
  );
}
