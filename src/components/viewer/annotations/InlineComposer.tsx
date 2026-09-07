"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { InkKey } from "@/lib/tokens";

/**
 * The one text input the viewer uses for placing a text box or writing a
 * comment on a pin.
 *
 * It is **permanently mounted** and merely repositioned, which is the whole
 * point. A mobile browser only opens (and keeps) the on-screen keyboard when
 * `focus()` runs SYNCHRONOUSLY inside the user gesture. Creating the element
 * on tap and focusing it a frame later — even one rAF later — makes Android
 * Chrome flash the keyboard open and immediately dismiss it, which is exactly
 * how it was reported: "it tries to open keyboard but instantly close it".
 *
 * So the element already exists, and the tap handler calls `.open()` on it
 * directly.
 */

export type ComposerKind = "text" | "comment";

export type InlineComposerHandle = {
  /** Called synchronously from a pointerdown handler. */
  open: (options: {
    kind: ComposerKind;
    leafId: string;
    x: number;
    y: number;
    pageWidth: number;
    pageHeight: number;
  }) => void;
  close: () => void;
};

export type ComposerResult = {
  kind: ComposerKind;
  leafId: string;
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
};

type Position = {
  kind: ComposerKind;
  leafId: string;
  x: number;
  y: number;
  pageWidth: number;
  pageHeight: number;
  /** Viewport coordinates, so the composer floats above the page. */
  left: number;
  top: number;
};

export const InlineComposer = forwardRef<
  InlineComposerHandle,
  {
    color: InkKey;
    onCommit: (result: ComposerResult) => void;
  }
>(function InlineComposer({ color, onCommit }, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [value, setValue] = useState("");
  const positionRef = useRef<Position | null>(null);

  useImperativeHandle(ref, () => ({
    open(options) {
      // Where the tapped page is, right now, in the viewport.
      const page = document.querySelector(
        `[data-leaf-id="${options.leafId}"]`,
      ) as HTMLElement | null;
      const rect = page?.getBoundingClientRect();

      const next: Position = {
        ...options,
        left: (rect?.left ?? 0) + options.x * (rect?.width ?? 0),
        top: (rect?.top ?? 0) + options.y * (rect?.height ?? 0),
      };

      positionRef.current = next;
      setPosition(next);
      setValue("");

      // SYNCHRONOUS. This is the line the whole component exists for.
      const element = textareaRef.current;
      if (element) {
        element.value = "";
        element.style.height = "auto";
        element.focus();
      }
    },
    close() {
      positionRef.current = null;
      setPosition(null);
      setValue("");
      textareaRef.current?.blur();
    },
  }));

  const commit = () => {
    const current = positionRef.current;
    const text = value.trim();

    positionRef.current = null;
    setPosition(null);
    setValue("");

    if (!current || !text) return;

    const element = textareaRef.current;
    onCommit({
      kind: current.kind,
      leafId: current.leafId,
      x: current.x,
      y: current.y,
      text,
      width: element ? element.offsetWidth / current.pageWidth : 0.4,
      height: element ? element.offsetHeight / current.pageHeight : 0.05,
    });
  };

  const active = position !== null;

  return (
    <div
      // Never unmounted — only moved and hidden. Unmounting it would put the
      // keyboard bug straight back.
      className="fixed z-50"
      style={
        active
          ? {
              left: Math.min(
                Math.max(8, position.left),
                (typeof window === "undefined" ? 400 : window.innerWidth) - 276,
              ),
              top: position.top,
              width: 268,
            }
          : // Parked off-screen rather than unmounted, and still focusable.
            { left: -9999, top: -9999, width: 268, pointerEvents: "none" }
      }
      aria-hidden={!active}
    >
      <div
        className={
          active
            ? "rounded-md border-2 border-accent bg-surface p-2 shadow-e3"
            : "opacity-0"
        }
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            const element = event.target;
            element.style.height = "auto";
            element.style.height = `${element.scrollHeight}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              positionRef.current = null;
              setPosition(null);
              setValue("");
              event.currentTarget.blur();
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            }
          }}
          placeholder={position?.kind === "comment" ? "Write a note…" : "Type…"}
          rows={1}
          // Always focusable: `open()` focuses it before React has applied
          // the state that makes it visible.
          tabIndex={0}
          /*
           * Theme-aware UI text, NOT the pen colour.
           *
           * The ink colours are marks on a white page and are deliberately
           * identical in both themes — ink-black is #1C1B18. Painting the
           * composer's own text in it puts near-black on the dark surface,
           * where you cannot read what you are typing. The swatch below shows
           * which colour it will become once it lands on the page.
           */
          className="w-full resize-none overflow-hidden bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
        />

        {active ? (
          <div className="mt-2 flex items-center gap-2">
            <span
              aria-hidden="true"
              title="The colour it will be on the page"
              className="size-4 shrink-0 rounded-full border border-hairline"
              style={{ background: `var(--${color})` }}
            />
            <span className="min-w-0 flex-1 text-caption leading-tight text-ink-3">
              Enter to keep
              <br />
              Esc to discard
            </span>
            <button
              type="button"
              // onMouseDown, not onClick: onClick fires after blur, and by
              // then the composer has already closed itself.
              onMouseDown={(event) => {
                event.preventDefault();
                commit();
              }}
              className="shrink-0 rounded-sm bg-accent px-3 py-1.5 text-label text-accent-on"
            >
              Add
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
