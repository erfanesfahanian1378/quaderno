"use client";

import { useState } from "react";
import { exportDocument } from "@/lib/export/run";
import { cn } from "@/lib/cn";

/**
 * Export, offered in all three flavours (ANNOTATION_ENGINE.md §8).
 *
 * "Notes only" is the revision handout — just your own pages plus the comment
 * appendix — and is the one a learner reaches for the night before an exam.
 */
const FLAVOURS = [
  {
    key: "flattened" as const,
    name: "Flattened PDF",
    hint: "Marks painted into the page. Opens anywhere.",
  },
  {
    key: "layered" as const,
    name: "Layered PDF",
    hint: "Marks stay editable in Acrobat and Preview.",
  },
  {
    key: "notes-only" as const,
    name: "Notes only",
    hint: "Just your own pages — the revision handout.",
  },
] as const;

export function ExportMenu({
  documentId,
  title,
  onPrint,
  printState,
}: {
  documentId: string;
  title: string;
  onPrint: () => void;
  printState: { rendering: boolean; tooLong: boolean; limit: number };
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (flavour: (typeof FLAVOURS)[number]["key"]) => {
    setBusy(flavour);
    setError(null);

    const result = await exportDocument(documentId, flavour, title);

    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "h-9 rounded-sm px-3 text-label transition-colors duration-[120ms]",
          open
            ? "bg-subtle text-ink"
            : "text-ink-2 hover:bg-subtle hover:text-ink",
        )}
      >
        Export
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-[280px] rounded-md border border-hairline bg-surface p-1 shadow-e2"
          >
            {FLAVOURS.map((flavour) => (
              <button
                key={flavour.key}
                type="button"
                role="menuitem"
                onClick={() => void run(flavour.key)}
                disabled={busy !== null}
                className="flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-subtle disabled:opacity-60"
              >
                <span className="text-label text-ink">
                  {flavour.name}
                  {busy === flavour.key ? " — building…" : ""}
                </span>
                <span className="text-caption text-ink-3">{flavour.hint}</span>
              </button>
            ))}

            <div className="my-1 h-px bg-hairline" />

            {/*
             * Print sits with the exports because that is where a reader
             * looks for it, and because it is the same decision: what leaves
             * the app and in what shape.
             */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPrint();
              }}
              disabled={printState.tooLong || printState.rendering}
              className="flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-subtle disabled:opacity-60"
            >
              <span className="text-label text-ink">
                Print
                {printState.rendering ? " — rendering pages…" : ""}
              </span>
              <span className="text-caption text-ink-3">
                {printState.tooLong
                  ? `Over ${printState.limit} pages — export a PDF instead.`
                  : "Renders every page first, then opens the dialog."}
              </span>
            </button>

            {error ? (
              <p className="px-3 py-2 text-caption text-danger">{error}</p>
            ) : (
              <p className="px-3 py-2 text-caption text-ink-3">
                Built in your browser — nothing is uploaded.
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
