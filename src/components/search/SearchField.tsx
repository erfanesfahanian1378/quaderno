"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/nav/icons";

export function SearchField({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K focuses the field, which is the shortcut people already have in their
  // fingers from every other tool.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        router.push(`/search?q=${encodeURIComponent(value)}`);
      }}
      className="relative"
    >
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search your notes, highlights and handouts"
        aria-label="Search"
        className="h-12 w-full rounded-md border border-hairline-strong bg-surface pl-11 pr-4 text-body text-ink placeholder:text-ink-3"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-sm bg-subtle px-1.5 py-0.5 font-mono text-caption text-ink-3 sm:block">
        ⌘K
      </kbd>
    </form>
  );
}
