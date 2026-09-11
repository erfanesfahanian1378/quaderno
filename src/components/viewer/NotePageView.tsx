"use client";

import { useState } from "react";
import { NotePageEditor } from "@/components/editor/NotePageEditor";
import { AudioAttachment } from "@/components/editor/AudioAttachment";
import { Markdown } from "@/components/editor/Markdown";
import { cn } from "@/lib/cn";
import type { ViewerLeaf } from "./Viewer";

/**
 * A note page renders as a **real page in the same scroll flow** — same width,
 * same shadow, same page number. Not a modal, not a sidebar
 * (ANNOTATION_ENGINE.md §6). Scrolling from handout page 3 into your own page
 * and back has to feel like one document.
 *
 * Focusing it gives it a subtle accent border and turns it into an editor in
 * place (DESIGN_BRIEF §5.8).
 */
export function NotePageView({
  leaf,
  scale,
  label,
  languageCode,
}: {
  leaf: ViewerLeaf;
  scale: number;
  label: string;
  /** For read-aloud on the recorder. Omitted on the read-only shared view. */
  languageCode?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(leaf.notePage?.content ?? "");

  const width = 595 * scale;
  const height = 842 * scale;

  return (
    <div className="flex flex-col items-center gap-2">
      <article
        className={cn(
          "page-sheet relative overflow-hidden transition-shadow duration-[120ms]",
          editing && "ring-2 ring-accent",
        )}
        style={{ width, height }}
        onClick={() => setEditing(true)}
      >
        {/* The folded corner, matching the rail's note thumbnail. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 z-10 size-6 bg-subtle"
          style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
        />

        {editing && leaf.notePage ? (
          <NotePageEditor
            notePageId={leaf.notePage.id}
            initialContent={content}
            initialUpdatedAt={new Date().toISOString()}
            scale={scale}
            {...(languageCode ? { languageCode } : {})}
            onContentChange={setContent}
          />
        ) : (
          <div
            className="h-full overflow-hidden px-10 py-10"
            style={{ fontSize: 17 * scale, lineHeight: `${28 * scale}px` }}
          >
            {content ? (
              // Rendered, not raw. The editor is markdown by design, but a
              // vocabulary template shown as pipes and dashes is not a table
              // anyone can fill in.
              <Markdown source={content} className="font-reading text-ink" />
            ) : (
              <span className="font-reading text-ink-3">
                An empty page. Click to start writing.
              </span>
            )}
          </div>
        )}
      </article>

      {/*
        Recording lives UNDER the sheet, not on it. The page is a real page —
        fixed size, same shadow as a handout page — and putting a control
        inside it would either overflow or make it not a page any more.
      */}
      {editing && leaf.notePage && languageCode ? (
        <div data-print-hide="" className="w-full" style={{ maxWidth: width }}>
          <AudioAttachment
            notePageId={leaf.notePage.id}
            languageCode={languageCode}
          />
        </div>
      ) : null}

      <span data-print-hide="" className="text-caption text-ink-3">
        {label}
      </span>
    </div>
  );
}
