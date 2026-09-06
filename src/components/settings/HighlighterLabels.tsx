"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import {
  HIGHLIGHT_DEFAULT_LABELS,
  HIGHLIGHT_KEYS,
  type HighlightKey,
} from "@/lib/tokens";

const STORAGE_KEY = "quaderno.highlighter-labels";

/**
 * Renaming the five highlighters.
 *
 * Stored per-browser rather than on the server: the labels are a personal
 * mnemonic, they change rarely, and putting them behind a round trip would
 * make renaming feel heavier than it is. If they ever need to follow a user
 * across devices, they move onto the User row — the token keys in the database
 * do not change either way, which is the point of storing keys rather than
 * hexes.
 */
export function HighlighterLabels() {
  const [labels, setLabels] = useState<Record<HighlightKey, string>>(
    HIGHLIGHT_DEFAULT_LABELS,
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored)
        setLabels({ ...HIGHLIGHT_DEFAULT_LABELS, ...JSON.parse(stored) });
    } catch {
      // Blocked storage: the defaults are perfectly usable.
    }
  }, []);

  const save = (key: HighlightKey, value: string) => {
    const next = { ...labels, [key]: value };
    setLabels(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Nothing to do; the label just will not persist.
    }
  };

  return (
    <Card className="divide-y divide-hairline">
      {HIGHLIGHT_KEYS.map((key) => (
        <div key={key} className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="size-7 shrink-0 rounded-sm border border-hairline"
            style={{ background: `var(--${key})` }}
          />
          <input
            value={labels[key]}
            onChange={(event) => save(key, event.target.value)}
            aria-label={`Label for the ${key.replace("hl-", "")} highlighter`}
            maxLength={24}
            className="h-10 flex-1 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
          />
        </div>
      ))}
    </Card>
  );
}
