"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { InkKey } from "@/lib/tokens";
import { cn } from "@/lib/cn";
import { FormatBar } from "./FormatBar";
import {
  buildColorMap,
  readSpansFromDom,
  spansToText,
  type TextSpan,
} from "@/lib/richtext";

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
  /** Plain text, always. `spans` carries the formatting when there is any. */
  text: string;
  spans?: TextSpan[];
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
  /*
   * A contenteditable rather than a textarea, so bold, italic, underline,
   * colour and font can apply to a SELECTION. A textarea has one style for
   * its whole value, which is the entire reason this changed.
   *
   * The permanently-mounted, synchronously-focused arrangement below is
   * unchanged and still load-bearing — see the note above.
   */
  const editorRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [empty, setEmpty] = useState(true);
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
      setEmpty(true);

      // SYNCHRONOUS. This is the line the whole component exists for.
      const element = editorRef.current;
      if (element) {
        element.textContent = "";
        element.focus();
      }
    },
    close() {
      positionRef.current = null;
      setPosition(null);
      setEmpty(true);
      if (editorRef.current) editorRef.current.textContent = "";
      editorRef.current?.blur();
    },
  }));

  const commit = () => {
    const current = positionRef.current;
    const element = editorRef.current;

    /*
     * Serialise BEFORE tearing the editor down. Reading computed styles out
     * of a node that React has already unmounted gives every span the
     * document defaults, which silently drops all the formatting.
     */
    const spans = element ? readSpansFromDom(element, buildColorMap()) : [];
    const text = spansToText(spans).trim();

    positionRef.current = null;
    setPosition(null);
    setEmpty(true);

    if (element) element.textContent = "";
    if (!current || !text) return;

    // Formatting is only worth storing when there is some: a note typed
    // plainly should be one span with no fields, or none at all.
    const formatted = spans.some(
      (span) => span.b || span.i || span.u || span.c || span.f,
    );

    onCommit({
      kind: current.kind,
      leafId: current.leafId,
      x: current.x,
      y: current.y,
      text,
      ...(formatted ? { spans: trimSpans(spans) } : {}),
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
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={
            position?.kind === "comment" ? "Write a note" : "Type text"
          }
          data-placeholder={
            position?.kind === "comment" ? "Write a note…" : "Type…"
          }
          onInput={(event) =>
            setEmpty(!event.currentTarget.textContent?.trim())
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              positionRef.current = null;
              setPosition(null);
              setEmpty(true);
              event.currentTarget.textContent = "";
              event.currentTarget.blur();
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            }

            // The shortcuts anyone expects in a text field. Without these the
            // toolbar is the only way to format, which on a laptop is worse
            // than the textarea it replaced.
            if (event.metaKey || event.ctrlKey) {
              const command = { b: "bold", i: "italic", u: "underline" }[
                event.key.toLowerCase()
              ];
              if (command) {
                event.preventDefault();
                document.execCommand("styleWithCSS", false, "true");
                document.execCommand(command);
              }
            }
          }}
          onPaste={(event) => {
            /*
             * Paste as PLAIN text. The clipboard can carry arbitrary HTML
             * from any page, and while nothing pasted is ever stored as
             * markup, letting it into the editor means fonts, sizes and
             * background colours that the span model cannot represent and
             * that the serialiser would quietly discard anyway.
             */
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }}
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
          className={cn(
            "max-h-48 w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-body text-ink outline-none",
            // The placeholder, which a contenteditable does not get for free.
            empty &&
              "before:pointer-events-none before:text-ink-3 before:content-[attr(data-placeholder)]",
          )}
        />

        {active ? (
          <FormatBar
            className="mt-2 border-t border-hairline pt-2"
            onCommand={(run) => {
              // Keep the caret where it was: the toolbar buttons already
              // prevent the mousedown default, and this re-asserts focus for
              // the browsers that drop it anyway.
              editorRef.current?.focus();
              run();
              setEmpty(!editorRef.current?.textContent?.trim());
            }}
          />
        ) : null}

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

/** Drops empty runs and caps the list, so one note stays a bounded payload. */
function trimSpans(spans: TextSpan[]): TextSpan[] {
  return spans.filter((span) => span.t.length > 0).slice(0, 200);
}
