"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  HIGHLIGHT_DEFAULT_LABELS,
  HIGHLIGHT_KEYS,
  type HighlightKey,
} from "@/lib/tokens";
import { CommentIcon, CopyIcon } from "@/components/nav/icons";
import type { SelectionCapture } from "./useTextSelection";

/**
 * The contextual popover above a text selection.
 *
 * DESIGN_BRIEF §5.7 calls this "the most-used interaction in the app", so it
 * is deliberately one tap from selection to a coloured mark: five colour dots,
 * underline, strikethrough, comment, copy — no menu, no submenu.
 *
 * Each colour carries its label, because colour is never the only channel
 * (§8) and because "yellow" means nothing while "grammar" means everything.
 */
export function SelectionPopover({
  selection,
  labels,
  onHighlight,
  onUnderline,
  onStrikethrough,
  onComment,
  onDismiss,
}: {
  selection: SelectionCapture;
  labels: Record<HighlightKey, string>;
  onHighlight: (color: HighlightKey) => void;
  onUnderline: () => void;
  onStrikethrough: () => void;
  onComment: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    below: boolean;
  } | null>(null);

  /*
   * Clamp the popover into the viewport.
   *
   * It is positioned at the selection's anchor, which is fine on a desktop
   * and broken on a phone: the pill is ~300px wide, a 390px screen leaves
   * almost no margin, and a selection near either edge pushes half of it
   * off-screen where it cannot be tapped. DESIGN_BRIEF §5.7 calls this "the
   * most-used interaction in the app", so it has to survive a narrow screen.
   *
   * useLayoutEffect, not useEffect, so the correction happens before paint
   * rather than as a visible jump.
   */
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const MARGIN = 8;
    const { width, height } = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const half = width / 2;
    const left = Math.min(
      Math.max(selection.anchor.x, half + MARGIN),
      viewportWidth - half - MARGIN,
    );

    // Not enough room above the selection: flip below it rather than clipping
    // off the top of the screen.
    const below = selection.anchor.y - height - MARGIN < 0;
    const top = below
      ? Math.min(selection.anchor.y + 24, viewportHeight - height - MARGIN)
      : selection.anchor.y - MARGIN;

    setPosition({ left, top, below });
  }, [selection.anchor.x, selection.anchor.y]);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection actions"
      className="fixed z-50 flex max-w-[calc(100vw-16px)] flex-wrap items-center justify-center gap-1 rounded-lg border border-hairline bg-surface p-1.5 shadow-e2"
      style={{
        left: position?.left ?? selection.anchor.x,
        top: position?.top ?? selection.anchor.y - 8,
        transform: `translate(-50%, ${position?.below ? "0" : "-100%"})`,
        // Hidden until measured, so it never flashes in the wrong place.
        visibility: position ? "visible" : "hidden",
      }}
    >
      {HIGHLIGHT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          title={`Highlight — ${labels[key] ?? HIGHLIGHT_DEFAULT_LABELS[key]}`}
          aria-label={`Highlight as ${labels[key] ?? HIGHLIGHT_DEFAULT_LABELS[key]}`}
          onClick={() => onHighlight(key)}
          className="size-8 rounded-full border border-hairline transition-transform duration-[120ms] hover:scale-110 motion-reduce:hover:scale-100"
          style={{ background: `var(--${key})` }}
        />
      ))}

      <span aria-hidden="true" className="mx-1 h-6 w-px bg-hairline" />

      <PopoverButton onClick={onUnderline} label="Underline">
        <span className="underline decoration-2">U</span>
      </PopoverButton>

      <PopoverButton onClick={onStrikethrough} label="Strike through">
        <span className="line-through decoration-2">S</span>
      </PopoverButton>

      <PopoverButton onClick={onComment} label="Add a comment">
        <CommentIcon className="size-4" />
      </PopoverButton>

      <PopoverButton
        onClick={() => {
          void navigator.clipboard?.writeText(selection.quotedText);
          onDismiss();
        }}
        label="Copy"
      >
        <CopyIcon className="size-4" />
      </PopoverButton>
    </div>
  );
}

function PopoverButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-sm text-label text-ink-2 transition-colors duration-[120ms] hover:bg-subtle hover:text-ink"
    >
      {children}
    </button>
  );
}
