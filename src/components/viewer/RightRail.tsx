"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Tabs } from "@/components/ui/Tabs";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState } from "@/components/ui";
import { CommentThread, type CommentRow } from "./comments/CommentThread";
import { cn } from "@/lib/cn";
import { OfflineToggle } from "@/components/library/OfflineToggle";
import {
  HIGHLIGHT_DEFAULT_LABELS,
  HIGHLIGHT_KEYS,
  type HighlightKey,
} from "@/lib/tokens";
import type { Annotation } from "./annotations/store";
import type { ViewerDocument } from "./Viewer";

type TabId = "comments" | "annotations" | "info";

/**
 * The right rail (desktop) and bottom sheet (mobile).
 *
 * The Annotations tab is the reason this exists. Marks on a page are for
 * reading; a list of every highlight with its quoted text, filterable by what
 * the colour MEANS, is what someone actually revises from the night before an
 * exam (DESIGN_BRIEF §5.7 calls it "a genuinely important screen").
 */
export function RightRail({
  document: doc,
  annotations,
  open,
  onClose,
  onJumpToLeaf,
  labels,
}: {
  document: ViewerDocument;
  annotations: Annotation[];
  open: boolean;
  onClose: () => void;
  onJumpToLeaf: (leafId: string) => void;
  labels: Record<HighlightKey, string>;
}) {
  const [tab, setTab] = useState<TabId>("annotations");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [colourFilter, setColourFilter] = useState<HighlightKey | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get<{ items: CommentRow[] }>(
      `/api/documents/${doc.id}/comments`,
    );
    if (result.ok) setComments(result.data.items);
  }, [doc.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const marks = useMemo(
    () =>
      annotations
        .filter((annotation) =>
          ["HIGHLIGHT", "UNDERLINE", "STRIKETHROUGH"].includes(annotation.kind),
        )
        .filter((annotation) =>
          colourFilter ? annotation.color === colourFilter : true,
        ),
    [annotations, colourFilter],
  );

  const roots = useMemo(
    () => comments.filter((comment) => comment.parentId === null),
    [comments],
  );
  const openRoots = roots.filter((root) => root.resolvedAt === null);
  const resolvedRoots = roots.filter((root) => root.resolvedAt !== null);

  const annotationFor = (annotationId: string | null) =>
    annotations.find((entry) => entry.id === annotationId) ?? null;

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs<TabId>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "annotations", label: "Marks", count: marks.length },
          { id: "comments", label: "Comments", count: openRoots.length },
          { id: "info", label: "Info" },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "annotations" ? (
          <>
            {/* Filter by what the colour MEANS, not by the colour. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setColourFilter(null)}
                aria-pressed={colourFilter === null}
                className={cn(
                  "h-8 rounded-full px-2.5 text-caption",
                  colourFilter === null
                    ? "bg-subtle text-ink"
                    : "text-ink-2 hover:bg-subtle",
                )}
              >
                All
              </button>
              {HIGHLIGHT_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setColourFilter(colourFilter === key ? null : key)
                  }
                  aria-pressed={colourFilter === key}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-caption",
                    colourFilter === key
                      ? "bg-subtle text-ink"
                      : "text-ink-2 hover:bg-subtle",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full"
                    style={{ background: `var(--${key})` }}
                  />
                  {labels[key] ?? HIGHLIGHT_DEFAULT_LABELS[key]}
                </button>
              ))}
            </div>

            {marks.length === 0 ? (
              <EmptyState
                title={colourFilter ? "Nothing in that colour" : "No marks yet"}
                description={
                  colourFilter
                    ? "Try another label, or clear the filter."
                    : "Highlight a phrase and it appears here, with its text — this is the list you revise from."
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {marks.map((mark) => (
                  <li key={mark.clientId}>
                    <button
                      type="button"
                      onClick={() => onJumpToLeaf(mark.leafId)}
                      className="w-full rounded-md border border-hairline bg-surface p-2.5 text-left transition-colors duration-[120ms] hover:bg-subtle"
                    >
                      <span
                        className="font-reading text-body-sm text-ink"
                        style={{
                          background: `var(--${mark.color})`,
                          boxShadow: `0 0 0 2px var(--${mark.color})`,
                        }}
                      >
                        {mark.quotedText?.trim() || "(no text under this mark)"}
                      </span>
                      <span className="mt-1.5 block text-caption text-ink-3">
                        {labels[mark.color as HighlightKey] ??
                          HIGHLIGHT_DEFAULT_LABELS[
                            mark.color as HighlightKey
                          ] ??
                          mark.kind.toLowerCase()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {tab === "comments" ? (
          openRoots.length === 0 && resolvedRoots.length === 0 ? (
            <EmptyState
              title="No comments yet"
              description="Drop a pin on a page, or comment on a highlight, to ask yourself a question you can answer later."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {openRoots.map((root) => {
                const mark = annotationFor(root.annotationId);
                return (
                  <CommentThread
                    key={root.id}
                    root={root}
                    replies={comments.filter(
                      (entry) => entry.parentId === root.id,
                    )}
                    quotedText={mark?.quotedText ?? null}
                    color={(mark?.color as HighlightKey) ?? null}
                    onJump={() => root.leafId && onJumpToLeaf(root.leafId)}
                    onChanged={() => void load()}
                  />
                );
              })}

              {/*
                Resolved threads are collapsed behind a count, never hidden.
                A resolved question you cannot find again is a lost one.
              */}
              {resolvedRoots.length > 0 ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowResolved((value) => !value)}
                    className="text-caption text-ink-3 hover:text-ink"
                  >
                    {showResolved ? "Hide" : "Show"} {resolvedRoots.length}{" "}
                    resolved
                  </button>

                  {showResolved ? (
                    <div className="mt-2 flex flex-col gap-2">
                      {resolvedRoots.map((root) => {
                        const mark = annotationFor(root.annotationId);
                        return (
                          <CommentThread
                            key={root.id}
                            root={root}
                            replies={comments.filter(
                              (entry) => entry.parentId === root.id,
                            )}
                            quotedText={mark?.quotedText ?? null}
                            color={(mark?.color as HighlightKey) ?? null}
                            onJump={() =>
                              root.leafId && onJumpToLeaf(root.leafId)
                            }
                            onChanged={() => void load()}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        ) : null}

        {tab === "info" ? (
          <dl className="flex flex-col gap-3 text-body-sm">
            <Row label="Title" value={doc.title} />
            <Row label="Pages" value={String(doc.leafCount ?? "—")} />
            {doc.originalName ? (
              <Row label="Original file" value={doc.originalName} />
            ) : null}
            {doc.conversionEngine === "libreoffice" ? (
              <div className="rounded-sm bg-warning-soft p-2.5 text-warning-on-soft">
                Converted from {doc.originalName ?? "the original"} — the layout
                may differ slightly. Your original is kept and can be
                downloaded.
              </div>
            ) : null}
            {!doc.hasTextLayer ? (
              <div className="rounded-sm bg-info-soft p-2.5 text-info-on-soft">
                This looks like a scan, so there is no text to select. Running
                OCR from the page menu makes it highlightable.
              </div>
            ) : null}
            <OfflineToggle documentId={doc.id} className="-ml-2 self-start" />

            <a
              href={`/api/documents/${doc.id}/original-url`}
              className="text-accent underline"
            >
              Download the original
            </a>
          </dl>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <aside
        aria-label="Document panel"
        className={cn(
          "hidden w-[var(--comments-rail-width)] shrink-0 border-l border-hairline bg-surface lg:block",
          !open && "lg:hidden",
        )}
      >
        {body}
      </aside>

      <Sheet open={open} onClose={onClose} title="Document panel">
        {body}
      </Sheet>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
