import { cn } from "@/lib/cn";
import type { AccentKey } from "@/lib/tokens";

/** Accent dot + name. The dot reads the subtree's data-accent, never a hex. */
export function LanguagePill({
  name,
  accentKey,
  className,
  size = "md",
}: {
  name: string;
  accentKey: AccentKey;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      data-accent={accentKey}
      className={cn(
        "inline-flex items-center gap-2",
        size === "sm" ? "text-caption" : "text-label",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 rounded-full bg-accent",
          size === "sm" ? "size-2" : "size-2.5",
        )}
      />
      {name}
    </span>
  );
}
