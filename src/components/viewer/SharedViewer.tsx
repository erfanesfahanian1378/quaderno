"use client";

import { useEffect, useState } from "react";
import { PdfPage } from "./PdfPage";
import { NotePageView } from "./NotePageView";
import { AnnotationLayer } from "./annotations/AnnotationLayer";
import { usePdfDocument, usePageCache } from "./usePdfDocument";
import { useRenderWindow } from "./useRenderWindow";
import { Banner } from "@/components/ui";
import type { ViewerLeaf } from "./Viewer";
import type { Annotation } from "./annotations/store";

/**
 * The read-only viewer behind a share link.
 *
 * A separate component rather than a `readOnly` flag on Viewer. Viewer carries
 * the outbox, the tool state, the composer, the comment threads and the
 * keyboard handlers — every one of which would need a branch, and a missed
 * branch in that list is a stranger writing to someone else's document. What
 * is left when you remove all of it is small enough to read in one screen,
 * which is the point.
 *
 * Marks are rendered because a shared page without them is just the original
 * handout; the marks are the thing worth sharing.
 */
export function SharedViewer({
  title,
  leaves,
  annotations,
  sourceUrl,
  accentKey,
}: {
  title: string;
  leaves: ViewerLeaf[];
  annotations: Annotation[];
  sourceUrl: string | null;
  accentKey: string;
}) {
  const [scrollRef, setScrollRef] = useState<HTMLDivElement | null>(null);
  const ref = { current: scrollRef };
  const { visible, isInWindow } = useRenderWindow(ref, leaves.length);

  const pdf = usePdfDocument(sourceUrl);
  const getPage = usePageCache(pdf.status === "ready" ? pdf.document : null);

  const byLeaf = new Map<string, Annotation[]>();
  for (const annotation of annotations) {
    const list = byLeaf.get(annotation.leafId) ?? [];
    list.push(annotation);
    byLeaf.set(annotation.leafId, list);
  }

  // Nothing here writes, so there is no outbox to flush and no unload guard.
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div data-accent={accentKey} className="flex h-dvh flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4">
        <span className="font-reading text-h3 text-ink">{title}</span>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-caption text-ink-3">
          Shared · read only
        </span>
        <span className="ml-auto text-caption text-ink-3">
          {visible} / {leaves.length}
        </span>
      </header>

      <div
        ref={setScrollRef}
        className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6"
      >
        {pdf.status === "error" ? (
          <div className="mx-auto max-w-[560px]">
            <Banner tone="danger">
              This document could not be loaded. The link may have expired.
            </Banner>
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-6">
          {leaves.map((leaf, index) => {
            const pageNumber = index + 1;

            return (
              <div key={leaf.id} data-page-index={pageNumber}>
                {leaf.kind === "NOTE_PAGE" ? (
                  <NotePageView
                    leaf={leaf}
                    scale={1}
                    label={leaf.label ?? String(pageNumber)}
                  />
                ) : pdf.status === "ready" ? (
                  <PdfPage
                    pageNumber={(leaf.sourcePageIndex ?? 0) + 1}
                    getPage={getPage}
                    scale={1}
                    rotation={leaf.rotation}
                    active={isInWindow(pageNumber)}
                    label={leaf.label ?? String(pageNumber)}
                    leafId={leaf.id}
                    interaction="text"
                  >
                    {(geometry) => (
                      <AnnotationLayer
                        annotations={byLeaf.get(leaf.id) ?? []}
                        geometry={geometry}
                        onSelect={() => undefined}
                        selectedClientId={null}
                      />
                    )}
                  </PdfPage>
                ) : (
                  <div className="page-sheet h-[842px] w-[595px] animate-pulse motion-reduce:animate-none" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
