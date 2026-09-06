"use client";

import { cn } from "@/lib/cn";

/**
 * Shown when a page is inserted (DESIGN_BRIEF §5.8).
 *
 * Vocabulary and verb conjugation are given real previews rather than a label,
 * because they are the language-learning payoff and the whole point is that a
 * learner sees something they want to fill in.
 */

export const TEMPLATES = [
  { key: "blank", name: "Blank", hint: "Write whatever you like." },
  { key: "lined", name: "Lined", hint: "Ruled, like a notebook." },
  { key: "grid", name: "Grid", hint: "Squared, for diagrams." },
  { key: "cornell", name: "Cornell", hint: "Questions, notes, summary." },
  {
    key: "vocabulary",
    name: "Vocabulary table",
    hint: "Word, translation, example, note.",
  },
  {
    key: "conjugation",
    name: "Verb conjugation",
    hint: "Person by tense.",
  },
] as const;

export type TemplateKey = (typeof TEMPLATES)[number]["key"];

export function TemplatePicker({
  onPick,
  onCancel,
}: {
  onPick: (template: TemplateKey) => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a page template"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
      onClick={onCancel}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[720px] rounded-lg border border-hairline bg-surface p-5 shadow-e3"
      >
        <h2 className="text-h2 text-ink">Insert a page</h2>
        <p className="mt-1 text-body-sm text-ink-2">
          Your own page, slotted into the document. The teacher&apos;s file is
          never changed.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              onClick={() => onPick(template.key)}
              className={cn(
                "flex flex-col gap-2 rounded-md border border-hairline p-3 text-left transition-colors duration-[120ms]",
                "hover:border-accent hover:bg-accent-soft",
              )}
            >
              <TemplatePreview kind={template.key} />
              <span className="text-label text-ink">{template.name}</span>
              <span className="text-caption text-ink-3">{template.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-label text-ink-2 hover:bg-subtle hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatePreview({ kind }: { kind: TemplateKey }) {
  const base =
    "aspect-[4/3] w-full rounded-[2px] border border-hairline bg-canvas p-2";

  if (kind === "lined") {
    return (
      <div className={`${base} flex flex-col justify-evenly`}>
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={index} className="h-px w-full bg-hairline-strong" />
        ))}
      </div>
    );
  }

  if (kind === "grid") {
    return (
      <div
        className={base}
        style={{
          backgroundImage:
            "linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)",
          backgroundSize: "8px 8px",
        }}
      />
    );
  }

  if (kind === "cornell") {
    return (
      <div className={`${base} flex gap-1`}>
        <div className="w-1/3 rounded-[2px] bg-subtle" />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex-1 rounded-[2px] bg-subtle" />
          <div className="h-1/4 rounded-[2px] bg-inset" />
        </div>
      </div>
    );
  }

  if (kind === "vocabulary") {
    return (
      <div className={`${base} flex flex-col gap-[3px]`}>
        <div className="flex gap-[3px]">
          {[40, 30, 30].map((width, index) => (
            <span
              key={index}
              className="h-2 rounded-[1px] bg-accent-soft"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="flex gap-[3px]">
            {[40, 30, 30].map((width, index) => (
              <span
                key={index}
                className="h-2 rounded-[1px] bg-subtle"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (kind === "conjugation") {
    return (
      <div className={`${base} flex flex-col gap-[3px]`}>
        <div className="flex gap-[3px]">
          <span className="h-2 w-1/4 rounded-[1px]" />
          {Array.from({ length: 3 }).map((_, index) => (
            <span
              key={index}
              className="h-2 flex-1 rounded-[1px] bg-accent-soft"
            />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="flex gap-[3px]">
            <span className="h-2 w-1/4 rounded-[1px] bg-accent-soft" />
            {Array.from({ length: 3 }).map((_, index) => (
              <span
                key={index}
                className="h-2 flex-1 rounded-[1px] bg-subtle"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return <div className={base} />;
}
