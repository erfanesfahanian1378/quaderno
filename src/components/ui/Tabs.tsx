"use client";

import { cn } from "@/lib/cn";

/**
 * A minimal tab strip. Roving tabindex and arrow-key movement, because the
 * right rail has to be reachable by keyboard — it is the route to every
 * annotation for someone who cannot draw (ANNOTATION_ENGINE.md §10).
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Panel"
      className={cn("flex gap-0.5 border-b border-hairline px-1", className)}
      onKeyDown={(event) => {
        const index = tabs.findIndex((tab) => tab.id === active);
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(tabs[(index + 1) % tabs.length]!.id);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(tabs[(index - 1 + tabs.length) % tabs.length]!.id);
        }
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-label transition-colors duration-[120ms]",
              selected
                ? "border-accent text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 ? (
              <span className="rounded-full bg-subtle px-1.5 text-caption tabular text-ink-2">
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
