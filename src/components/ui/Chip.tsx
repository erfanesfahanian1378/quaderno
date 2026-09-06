import { cn } from "@/lib/cn";

export function Chip({
  children,
  onRemove,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  className?: string;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-caption",
        tone === "accent" ? "bg-accent-soft text-ink" : "bg-subtle text-ink-2",
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="-mr-0.5 rounded-full px-1 text-ink-3 hover:text-ink"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
