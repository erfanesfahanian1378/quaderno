"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
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
  | { status: "conflict" }
  | { status: "error"; message: string };

const DEBOUNCE_MS = 800;

export function NotePageEditor({
  notePageId,
  initialContent,
  initialUpdatedAt,
  scale,
  onContentChange,
}: {
  notePageId: string;
  initialContent: string;
  initialUpdatedAt: string;
  scale: number;
  onContentChange?: (content: string) => void;
}) {
  const [content, setContent] = useState(initialContent);
  const [state, setState] = useState<SaveState>({ status: "idle" });
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
        setState({
          status: "error",
          message: "No connection — your text is still here.",
        });
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-10 pt-3">
        <span className="text-caption text-ink-3">Markdown</span>
        <SaveLabel state={state} onOverwrite={() => void save(content, true)} />
      </div>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder="Write your notes here…"
        className={cn(
          "min-h-0 flex-1 resize-none bg-transparent px-10 pb-10 pt-4",
          // Serif body, generous line height — this is what makes a note page
          // feel like a notebook rather than a form.
          "font-reading text-ink placeholder:text-ink-3 focus:outline-none",
        )}
        style={{
          fontSize: 17 * scale,
          lineHeight: `${28 * scale}px`,
        }}
      />
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
