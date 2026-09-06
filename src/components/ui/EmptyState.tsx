import { cn } from "@/lib/cn";

/**
 * Every list in this app has one of these. CLAUDE.md: "Never swallow an error
 * into a silent empty state" — so an empty state says what would go here and
 * offers the action that puts it there.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-md border border-dashed border-hairline-strong px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-h3 text-ink">{title}</p>
      {description ? (
        <p className="max-w-[46ch] text-body-sm text-ink-2">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
