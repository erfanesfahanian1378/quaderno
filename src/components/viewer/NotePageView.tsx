"use client";

import type { ViewerLeaf } from "./Viewer";

/**
 * A note page renders as a **real page in the same scroll flow** — same width,
 * same shadow, same page number. Not a modal, not a sidebar
 * (ANNOTATION_ENGINE.md §6). Scrolling from handout page 3 into your own page
 * and back has to feel like one document.
 */
export function NotePageView({
  leaf,
  scale,
  label,
}: {
  leaf: ViewerLeaf;
  scale: number;
  label: string;
}) {
  const width = 595 * scale;
  const height = 842 * scale;

  return (
    <div className="flex flex-col items-center gap-2">
      <article
        className="page-sheet relative overflow-hidden"
        style={{ width, height }}
      >
        {/* The folded corner, matching the rail's note thumbnail. */}
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 size-6 bg-subtle"
          style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
        />

        <div
          className="h-full overflow-hidden px-10 py-10"
          style={{ fontSize: 17 * scale, lineHeight: `${28 * scale}px` }}
        >
          <div className="whitespace-pre-wrap font-reading text-ink">
            {leaf.notePage?.content || (
              <span className="text-ink-3">
                An empty page. Click to start writing.
              </span>
            )}
          </div>
        </div>
      </article>

      <span className="text-caption text-ink-3">{label}</span>
    </div>
  );
}
