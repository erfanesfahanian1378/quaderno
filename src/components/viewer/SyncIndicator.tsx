"use client";

import type { SyncState } from "@/lib/outbox/queue";
import { cn } from "@/lib/cn";

/**
 * Sync state per document: synced / n pending / offline.
 *
 * ARCHITECTURE.md §5: "Never silently pretend a queued write landed." This is
 * the whole contract with the user — they annotated on the metro and need to
 * know the app still has it.
 *
 * Deliberately not a toast (DESIGN_BRIEF §7): syncing happens far too often.
 * It carries an icon AND a word, because colour is never the only channel.
 */
export function SyncIndicator({ state }: { state: SyncState }) {
  const { label, tone, mark } = describe(state);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-caption transition-colors duration-[180ms]",
        tone,
      )}
    >
      <span aria-hidden="true">{mark}</span>
      {label}
    </span>
  );
}

function describe(state: SyncState): {
  label: string;
  tone: string;
  mark: string;
} {
  switch (state.status) {
    case "synced":
      return { label: "Saved", tone: "text-ink-3", mark: "✓" };
    case "pending":
      return {
        label: `${state.count} to save`,
        tone: "text-ink-2",
        mark: "↑",
      };
    case "offline":
      return {
        label: `Offline · ${state.count} queued`,
        tone: "bg-warning-soft text-warning-on-soft",
        mark: "⌁",
      };
    case "error":
      return {
        label: `Not saved · ${state.count}`,
        tone: "bg-danger-soft text-danger-on-soft",
        mark: "!",
      };
  }
}
