"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reads the *resolved* value of each custom property out of the DOM instead of
 * hardcoding hexes here. Two reasons:
 *
 *  1. CLAUDE.md rule #5 — hex literals live only in tokens.css. A preview page
 *     that retyped them would be the first place they drift.
 *  2. It reads through whatever theme the enclosing subtree carries, so the
 *     same component prints the light values on the left and the dark ones on
 *     the right with no extra plumbing.
 */
export function TokenTable({
  tokens,
  swatch = "fill",
}: {
  tokens: readonly string[];
  swatch?: "fill" | "text" | "shadow";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const read = () => {
      const styles = getComputedStyle(node);
      const next: Record<string, string> = {};
      for (const token of tokens) {
        next[token] = styles.getPropertyValue(token).trim();
      }
      setValues(next);
    };

    read();

    // The values change under us when the theme flips, so watch for it.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", read);

    return () => {
      observer.disconnect();
      query.removeEventListener("change", read);
    };
  }, [tokens]);

  return (
    <div
      ref={rootRef}
      className="divide-y divide-hairline overflow-hidden rounded-sm border border-hairline"
    >
      {tokens.map((token) => (
        <div
          key={token}
          className="flex items-center gap-3 bg-surface px-2.5 py-2"
        >
          <Swatch token={token} kind={swatch} />
          <code className="flex-1 font-mono text-caption text-ink">
            {token}
          </code>
          <code className="font-mono text-caption text-ink-3">
            {values[token] || "…"}
          </code>
        </div>
      ))}
    </div>
  );
}

function Swatch({ token, kind }: { token: string; kind: string }) {
  if (kind === "shadow") {
    return (
      <div
        className="size-8 shrink-0 rounded-sm bg-surface"
        style={{ boxShadow: `var(${token})` }}
      />
    );
  }
  if (kind === "text") {
    return (
      <div
        className="grid size-8 shrink-0 place-items-center rounded-sm bg-surface text-h3"
        style={{ color: `var(${token})` }}
      >
        Aa
      </div>
    );
  }
  return (
    <div
      className="size-8 shrink-0 rounded-sm border border-hairline"
      style={{ background: `var(${token})` }}
    />
  );
}
