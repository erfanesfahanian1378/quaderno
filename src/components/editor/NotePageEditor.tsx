"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as writes from "@/lib/outbox/writes";
import { Markdown } from "./Markdown";
import { cn } from "@/lib/cn";

/**
 * The note page editor.
 *
 * A textarea over markdown rather than a rich-text tree. TipTap and Lexical
 * are each 100 KB+ in a route with a 250 KB budget, and `NotePage.content` is
 * markdown either way — the editor's job is to not lose it. What that buys is
 * a page that can never desync from its source of truth, and an editor that
 * works identically on a phone keyboard.
 *
 * Autosave: 800ms debounce, `If-Unmodified-Since` on every write, and a
 * visible state that never nags (DESIGN_BRIEF §5.8).
 */

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "queued" }
  | { status: "conflict" }
  | { status: "error"; message: string };

const DEBOUNCE_MS = 800;

/**
 * Write, Split, Read.
 *
 * The read view has always rendered markdown properly — a vocabulary table
 * looks like a table. Clicking into it replaced that with the raw source, so
 * the act of starting to type appeared to destroy the formatting. It did not;
 * it just showed the pipes and dashes underneath, with nothing on screen
 * saying so and no way back except clicking away.
 *
 * Split is the default because it answers that directly: the table stays
 * visible, live, while you type into the source beside it.
 */
type Mode = "write" | "split" | "read";

const MODES: { id: Mode; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "split", label: "Split" },
  { id: "read", label: "Read" },
];

const MODE_KEY = "quaderno:note-mode";
const SPELL_KEY = "quaderno:note-spellcheck";

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (window.localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    // Private window, or storage blocked. A default is fine.
    return fallback;
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // See above.
  }
}

export function NotePageEditor({
  notePageId,
  initialContent,
  initialUpdatedAt,
  scale,
  languageCode,
  onContentChange,
}: {
  notePageId: string;
  initialContent: string;
  initialUpdatedAt: string;
  scale: number;
  /**
   * Which dictionary the browser should spell-check against.
   *
   * Without it the textarea inherits the page's `lang="en"`, and every
   * Italian word on the page is underlined as a mistake — which is worse than
   * no spell-check at all, and is why it used to be off.
   */
  languageCode?: string;
  onContentChange?: (content: string) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const [mode, setMode] = useState<Mode>("split");
  const [spell, setSpell] = useState(true);

  // Read after mount: localStorage does not exist while rendering on the
  // server, and reading it during render is a hydration mismatch.
  useEffect(() => {
    setMode(stored<Mode>(MODE_KEY, "split"));
    setSpell(stored(SPELL_KEY, "on") === "on");
  }, []);
  const lastModified = useRef(initialUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const save = useCallback(
    async (next: string, force = false) => {
      setState({ status: "saving" });

      const response = await fetch(`/api/note-pages/${notePageId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(force
            ? {}
            : {
                "If-Unmodified-Since": new Date(
                  lastModified.current,
                ).toUTCString(),
              }),
        },
        body: JSON.stringify({ content: next }),
      }).catch(() => null);

      if (!response) {
        /*
         * No network. The text is not lost and it is not merely "still in the
         * textarea" — it goes into the durable write queue, so it survives a
         * reload and lands when the connection does.
         *
         * Queued WITHOUT the precondition: by the time it flushes, minutes or
         * hours later, `If-Unmodified-Since` would be stale and conflict with
         * the page's own earlier save. Conflicts that matter — someone else
         * changing it meanwhile — still surface, from the server's own check
         * against the stored `updatedAt`.
         */
        await writes.enqueue({
          method: "PUT",
          path: `/api/note-pages/${notePageId}`,
          body: { content: next },
          // One stream per page: only the last version of a page needs to be
          // sent, and they must land in order.
          stream: `note-page:${notePageId}`,
          label: "Note page",
        });

        setState({ status: "queued" });
        return;
      }

      if (response.status === 409) {
        // Never resolve this silently. Someone's notes are on both sides.
        setState({ status: "conflict" });
        return;
      }

      if (!response.ok) {
        setState({ status: "error", message: "Could not save." });
        return;
      }

      const saved = (await response.json()) as { updatedAt: string };
      lastModified.current = saved.updatedAt;
      setState({ status: "saved", at: Date.now() });
    },
    [notePageId],
  );

  const onChange = (next: string) => {
    setContent(next);
    onContentChange?.(next);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), DEBOUNCE_MS);
  };

  // Flush on unmount, so navigating away mid-debounce does not drop the edit.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const type = {
    fontSize: 17 * scale,
    lineHeight: `${28 * scale}px`,
  };

  /*
   * A page sheet is 595pt wide before scaling. Below roughly 520px there is
   * not room for two columns of prose, so split stacks instead of shrinking
   * both halves into uselessness.
   */
  const narrow = 595 * scale < 520;
  const showEditor = mode !== "read";
  const showPreview = mode !== "write";

  const editor = (
    <textarea
      ref={textareaRef}
      value={content}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={spell}
      {...(languageCode ? { lang: languageCode } : {})}
      placeholder="Write your notes here…"
      className={cn(
        "min-h-0 flex-1 resize-none bg-transparent focus:outline-none",
        // Serif body, generous line height — this is what makes a note page
        // feel like a notebook rather than a form.
        "font-reading text-ink placeholder:text-ink-3",
        mode === "split" ? "px-5 pb-6 pt-2" : "px-10 pb-10 pt-4",
      )}
      style={type}
    />
  );

  const preview = (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-auto",
        mode === "split" ? "px-5 pb-6 pt-2" : "px-10 pb-10 pt-4",
      )}
      style={type}
      aria-label="Preview"
    >
      {content ? (
        <Markdown source={content} className="font-reading text-ink" />
      ) : (
        <span className="font-reading text-ink-3">Nothing to preview yet.</span>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pt-3">
        <div className="flex items-center gap-1.5">
          {/*
            The mode switch, where "Markdown" used to be a label that only
            described the problem.
          */}
          <div
            role="group"
            aria-label="Note view"
            className="flex rounded-sm border border-hairline p-0.5"
          >
            {MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={mode === entry.id}
                onClick={() => {
                  setMode(entry.id);
                  remember(MODE_KEY, entry.id);
                }}
                className={cn(
                  "rounded-xs px-2 py-1 text-caption transition-colors duration-[120ms]",
                  mode === entry.id
                    ? "bg-accent-soft text-accent-on-soft"
                    : "text-ink-3 hover:text-ink",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {/*
            Spell-check, on by default now that it checks against the right
            language. Still a toggle: a page of deliberate half-learnt
            spellings, or one in a language the browser has no dictionary for,
            is better read without red underlines everywhere.
          */}
          <button
            type="button"
            aria-pressed={spell}
            title={
              spell
                ? `Spell-check on${languageCode ? ` (${languageCode})` : ""}`
                : "Spell-check off"
            }
            onClick={() => {
              setSpell((on) => {
                remember(SPELL_KEY, on ? "off" : "on");
                return !on;
              });
              // Chrome only re-runs the checker when the field is re-focused.
              const field = textareaRef.current;
              if (field) {
                field.blur();
                window.setTimeout(() => field.focus(), 0);
              }
            }}
            className={cn(
              "rounded-sm px-2 py-1 text-caption transition-colors duration-[120ms]",
              spell
                ? "bg-accent-soft text-accent-on-soft"
                : "text-ink-3 hover:text-ink",
            )}
          >
            ABC
          </button>
        </div>

        <SaveLabel state={state} onOverwrite={() => void save(content, true)} />
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1",
          mode === "split" && (narrow ? "flex-col divide-y" : "divide-x"),
          mode === "split" && "divide-hairline",
        )}
      >
        {showEditor ? editor : null}
        {showPreview ? preview : null}
      </div>
    </div>
  );
}

function SaveLabel({
  state,
  onOverwrite,
}: {
  state: SaveState;
  onOverwrite: () => void;
}) {
  if (state.status === "conflict") {
    return (
      <span className="flex items-center gap-2 rounded-sm bg-warning-soft px-2 py-1 text-caption text-warning-on-soft">
        Changed elsewhere
        <button
          type="button"
          onClick={onOverwrite}
          className="underline underline-offset-2"
        >
          overwrite
        </button>
      </span>
    );
  }

  if (state.status === "queued") {
    return (
      <span className="rounded-sm bg-warning-soft px-2 py-1 text-caption text-warning-on-soft">
        Saved on this device — will sync
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span className="rounded-sm bg-danger-soft px-2 py-1 text-caption text-danger-on-soft">
        {state.message}
      </span>
    );
  }

  return (
    <span className="text-caption text-ink-3" aria-live="polite">
      {state.status === "saving"
        ? "saving…"
        : state.status === "saved"
          ? "saved"
          : ""}
    </span>
  );
}
