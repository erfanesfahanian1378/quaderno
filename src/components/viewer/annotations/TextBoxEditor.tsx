"use client";

import { useEffect, useRef, useState } from "react";
import type { InkKey } from "@/lib/tokens";

/**
 * Typing a text box on the page.
 *
 * Placed by a tap, edited in place, committed on blur or ⌘Enter, discarded on
 * Escape or when left empty — so a mis-tap costs nothing.
 *
 * `fontSize` is stored as a fraction of page height (ANNOTATION_ENGINE.md §5)
 * so the text scales with zoom instead of drifting away from the page, and
 * the final height is measured and stored so other clients lay it out
 * identically without re-measuring fonts.
 */
export function TextBoxEditor({
  x,
  y,
  color,
  pageWidth,
  pageHeight,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  color: InkKey;
  pageWidth: number;
  pageHeight: number;
  onCommit: (text: string, width: number, height: number) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const ready = useRef(false);

  useEffect(() => {
    /*
     * Focus on the NEXT frame, and ignore any blur before that.
     *
     * The box is mounted by the same tap that is still in flight, and the
     * tail of that gesture blurs it the instant it appears — which commits an
     * empty box, cancels, and unmounts. Waiting a frame lets the pointer
     * sequence finish first.
     */
    const frame = requestAnimationFrame(() => {
      ref.current?.focus();
      ready.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const commit = () => {
    // A blur before the box was ever focused is the tail of the placing tap,
    // not the user leaving.
    if (!ready.current) return;

    const text = value.trim();
    if (!text) {
      onCancel();
      return;
    }

    const element = ref.current;
    const width = element ? element.offsetWidth / pageWidth : 0.4;
    const height = element ? element.offsetHeight / pageHeight : 0.06;

    onCommit(text, width, height);
  };

  // 2.2% of page height ≈ 18px on an A4 page at 100%.
  const fontSize = 0.022 * pageHeight;

  return (
    <div
      className="absolute z-40"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `min(40%, ${pageWidth - x * pageWidth - 8}px)`,
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          // Auto-grow, so the box is always exactly as tall as its text.
          const element = event.target;
          element.style.height = "auto";
          element.style.height = `${element.scrollHeight}px`;
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
          }
        }}
        placeholder="Type…"
        rows={1}
        className="w-full resize-none overflow-hidden rounded-sm border-2 border-accent bg-surface/95 p-1 leading-snug outline-none"
        style={{
          fontSize,
          color: `var(--${color})`,
        }}
      />
      <p className="mt-1 rounded-sm bg-ink/80 px-1.5 py-0.5 text-caption text-ink-inverse">
        Tap away to keep it · Esc to discard
      </p>
    </div>
  );
}
