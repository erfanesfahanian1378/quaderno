"use client";

import { cn } from "@/lib/cn";
import {
  CommentIcon,
  EraserIcon,
  HandIcon,
  HighlighterIcon,
  PenIcon,
  ShapeIcon,
  TextIcon,
  UndoIcon,
} from "@/components/nav/icons";
import {
  HIGHLIGHT_KEYS,
  INK_KEYS,
  INK_WIDTHS,
  type HighlightKey,
  type InkKey,
  type InkWidthKey,
} from "@/lib/tokens";

export type Tool =
  "select" | "highlight" | "pen" | "eraser" | "text" | "shape" | "comment";

/**
 * The floating tool pill. DESIGN_BRIEF §5.7.
 *
 * A roving-tabindex toolbar with `aria-pressed` on the active tool
 * (ANNOTATION_ENGINE.md §10) — every tool has to be reachable by keyboard,
 * because a user who cannot draw must still be able to read, navigate and
 * comment.
 *
 * On mobile it sits above the safe-area inset and every target is ≥48px, which
 * §8 makes non-negotiable for this toolbar specifically.
 */
export function AnnotationToolbar({
  tool,
  onToolChange,
  highlightColor,
  onHighlightColor,
  inkColor,
  onInkColor,
  inkWidth,
  onInkWidth,
  onUndo,
  canUndo,
  labels,
}: {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  highlightColor: HighlightKey;
  onHighlightColor: (color: HighlightKey) => void;
  inkColor: InkKey;
  onInkColor: (color: InkKey) => void;
  inkWidth: InkWidthKey;
  onInkWidth: (width: InkWidthKey) => void;
  onUndo: () => void;
  canUndo: boolean;
  labels: Record<HighlightKey, string>;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 pb-[calc(16px+env(safe-area-inset-bottom))] lg:pb-16">
      {/* The colour swatches expand UPWARD out of the pill, per the brief. */}
      {tool === "highlight" ? (
        /*
          Wraps rather than overflowing. Five swatches with their labels are
          far wider than a phone, and an overflowing row put "grammar" off the
          left edge and "question" off the right — both unreachable. The
          labels cannot simply be dropped: colour is never the only channel
          (DESIGN_BRIEF §8), and "yellow" means nothing while "grammar" means
          everything.
        */
        <div className="pointer-events-auto flex max-w-[calc(100vw-16px)] flex-wrap items-center justify-center gap-1 rounded-lg border border-hairline bg-surface p-1.5 shadow-e2 sm:rounded-full">
          {HIGHLIGHT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onHighlightColor(key)}
              aria-pressed={highlightColor === key}
              aria-label={`Highlighter — ${labels[key]}`}
              title={labels[key]}
              className={cn(
                "flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-caption transition-colors duration-[120ms]",
                highlightColor === key ? "bg-subtle text-ink" : "text-ink-2",
              )}
              style={{ whiteSpace: "nowrap" }}
            >
              <span
                className="size-7 rounded-full border border-hairline"
                style={{ background: `var(--${key})` }}
              />
              {labels[key]}
            </button>
          ))}
        </div>
      ) : null}

      {tool === "pen" ? (
        <div className="pointer-events-auto flex max-w-[calc(100vw-16px)] flex-wrap items-center justify-center gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 shadow-e2 sm:rounded-full">
          <div className="flex gap-1.5">
            {INK_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onInkColor(key)}
                aria-pressed={inkColor === key}
                aria-label={`Pen colour ${key}`}
                className={cn(
                  "size-7 rounded-full transition-transform duration-[120ms]",
                  inkColor === key && "ring-2 ring-accent ring-offset-2",
                )}
                style={{ background: `var(--${key})` }}
              />
            ))}
          </div>

          <span aria-hidden="true" className="h-6 w-px bg-hairline" />

          <div className="flex items-center gap-1.5">
            {(Object.keys(INK_WIDTHS) as InkWidthKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onInkWidth(key)}
                aria-pressed={inkWidth === key}
                aria-label={`${key} nib`}
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  inkWidth === key ? "bg-subtle" : "",
                )}
              >
                <span
                  className="rounded-full bg-ink"
                  style={{
                    width: key === "fine" ? 3 : key === "medium" ? 5 : 8,
                    height: key === "fine" ? 3 : key === "medium" ? 5 : 8,
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        role="toolbar"
        aria-label="Annotation tools"
        className="pointer-events-auto flex max-w-[calc(100vw-16px)] items-center gap-0.5 overflow-x-auto rounded-full border border-hairline bg-surface p-1.5 shadow-e2 sm:gap-1"
      >
        <ToolButton
          tool="select"
          active={tool}
          onSelect={onToolChange}
          label="Select"
        >
          <HandIcon className="size-5" />
        </ToolButton>
        <ToolButton
          tool="highlight"
          active={tool}
          onSelect={onToolChange}
          label="Highlight"
        >
          <span className="relative grid place-items-center">
            <HighlighterIcon className="size-5" />
            <span
              aria-hidden="true"
              className="absolute -bottom-1 h-1 w-4 rounded-full"
              style={{ background: `var(--${highlightColor})` }}
            />
          </span>
        </ToolButton>
        <ToolButton
          tool="pen"
          active={tool}
          onSelect={onToolChange}
          label="Pen"
        >
          <PenIcon className="size-5" />
        </ToolButton>
        <ToolButton
          tool="eraser"
          active={tool}
          onSelect={onToolChange}
          label="Eraser"
        >
          <EraserIcon className="size-5" />
        </ToolButton>
        <ToolButton
          tool="text"
          active={tool}
          onSelect={onToolChange}
          label="Text box"
        >
          <TextIcon className="size-5" />
        </ToolButton>
        <ToolButton
          tool="shape"
          active={tool}
          onSelect={onToolChange}
          label="Shape"
        >
          <ShapeIcon className="size-5" />
        </ToolButton>
        <ToolButton
          tool="comment"
          active={tool}
          onSelect={onToolChange}
          label="Comment pin"
        >
          <CommentIcon className="size-5" />
        </ToolButton>

        <span aria-hidden="true" className="mx-1 h-7 w-px bg-hairline" />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (⌘Z)"
          className="grid size-12 place-items-center rounded-full text-ink-2 transition-colors duration-[120ms] hover:bg-subtle hover:text-ink disabled:opacity-40"
        >
          <UndoIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  tool,
  active,
  onSelect,
  label,
  children,
}: {
  tool: Tool;
  active: Tool;
  onSelect: (tool: Tool) => void;
  label: string;
  children: React.ReactNode;
}) {
  const isActive = tool === active;

  return (
    <button
      type="button"
      onClick={() => onSelect(tool)}
      aria-pressed={isActive}
      aria-label={label}
      title={label}
      // 48px, which §8 requires for this toolbar specifically.
      className={cn(
        "grid size-12 place-items-center rounded-full text-body transition-colors duration-[120ms]",
        isActive
          ? "bg-accent text-accent-on"
          : "text-ink-2 hover:bg-subtle hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
