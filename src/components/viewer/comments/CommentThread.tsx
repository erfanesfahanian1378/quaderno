"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import type { HighlightKey } from "@/lib/tokens";

export type CommentRow = {
  id: string;
  leafId: string | null;
  annotationId: string | null;
  parentId: string | null;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
};

/**
 * One thread: a root comment, its replies, and the actions on it.
 *
 * Threading is one level deep on purpose (ANNOTATION_ENGINE.md §5). A reply
 * to a reply attaches to the root, so a thread can always be read top to
 * bottom without indentation games.
 */
export function CommentThread({
  root,
  replies,
  quotedText,
  color,
  onJump,
  onChanged,
}: {
  root: CommentRow;
  replies: CommentRow[];
  quotedText: string | null;
  color: HighlightKey | null;
  onJump: () => void;
  onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const resolved = root.resolvedAt !== null;

  const setResolved = async (value: boolean) => {
    setBusy(true);
    await api.patch(`/api/comments/${root.id}`, { resolved: value });
    setBusy(false);
    onChanged();
  };

  const submitReply = async (documentId: string) => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    await api.post(`/api/documents/${documentId}/comments`, {
      body,
      parentId: root.id,
      ...(root.leafId ? { leafId: root.leafId } : {}),
    });
    setDraft("");
    setReplying(false);
    setBusy(false);
    onChanged();
  };

  return (
    <article
      className={cn(
        "rounded-md border border-hairline bg-surface p-3",
        resolved && "opacity-60",
      )}
    >
      {quotedText ? (
        <button
          type="button"
          onClick={onJump}
          className="mb-2 block w-full text-left"
        >
          <span
            className="font-reading text-body-sm text-ink"
            style={
              color
                ? {
                    background: `var(--${color})`,
                    boxShadow: `0 0 0 2px var(--${color})`,
                  }
                : undefined
            }
          >
            {quotedText.length > 120
              ? `${quotedText.slice(0, 120)}…`
              : quotedText}
          </span>
        </button>
      ) : null}

      <p className="whitespace-pre-wrap text-body-sm text-ink">{root.body}</p>

      {replies.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2 border-l-2 border-hairline pl-3">
          {replies.map((reply) => (
            <li
              key={reply.id}
              className="whitespace-pre-wrap text-body-sm text-ink-2"
            >
              {reply.body}
            </li>
          ))}
        </ul>
      ) : null}

      {replying ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            autoFocus
            placeholder="Reply…"
            className="w-full resize-none rounded-sm border border-hairline-strong bg-surface p-2 text-body-sm text-ink"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onMouseDown={(event) => {
                event.preventDefault();
                void submitReply(
                  window.location.pathname.split("/d/")[1]?.split("/")[0] ?? "",
                );
              }}
              className="rounded-sm bg-accent px-3 py-1.5 text-caption text-accent-on disabled:opacity-50"
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => setReplying(false)}
              className="rounded-sm px-3 py-1.5 text-caption text-ink-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3 text-caption text-ink-3">
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="hover:text-ink"
          >
            Reply
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setResolved(!resolved)}
            className="hover:text-ink"
          >
            {resolved ? "Reopen" : "Resolve"}
          </button>
          {quotedText ? (
            <button type="button" onClick={onJump} className="hover:text-ink">
              Go to mark
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}
