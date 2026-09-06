"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import type { AccentKey } from "@/lib/tokens";
import { SearchIcon, StarIcon } from "@/components/nav/icons";

export function LibraryFilters({
  languages,
  active,
}: {
  languages: { id: string; name: string; accentKey: string }[];
  active: { languageId?: string; q?: string; starred?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.push(`/library?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative flex-1 sm:max-w-[280px]">
        <span className="sr-only">Search documents</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          defaultValue={active.q ?? ""}
          placeholder="Search titles"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setParam("q", event.currentTarget.value);
            }
          }}
          className="h-10 w-full rounded-sm border border-hairline-strong bg-surface pl-9 pr-3 text-body text-ink placeholder:text-ink-3"
        />
      </label>

      <button
        type="button"
        onClick={() => setParam("languageId", null)}
        className={cn(
          "h-10 rounded-sm px-3 text-label transition-colors duration-[120ms]",
          !active.languageId
            ? "bg-subtle text-ink"
            : "text-ink-2 hover:bg-subtle",
        )}
      >
        All
      </button>

      {languages.map((language) => (
        <button
          key={language.id}
          type="button"
          data-accent={language.accentKey as AccentKey}
          onClick={() => setParam("languageId", language.id)}
          className={cn(
            "flex h-10 items-center gap-2 rounded-sm px-3 text-label transition-colors duration-[120ms]",
            active.languageId === language.id
              ? "bg-accent-soft text-ink"
              : "text-ink-2 hover:bg-subtle",
          )}
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
          {language.name}
        </button>
      ))}

      <button
        type="button"
        onClick={() => setParam("starred", active.starred === "1" ? null : "1")}
        aria-pressed={active.starred === "1"}
        className={cn(
          "flex h-10 items-center gap-2 rounded-sm px-3 text-label transition-colors duration-[120ms]",
          active.starred === "1"
            ? "bg-subtle text-ink"
            : "text-ink-2 hover:bg-subtle",
        )}
      >
        <StarIcon className="size-4" filled={active.starred === "1"} />
        Starred
      </button>
    </div>
  );
}
