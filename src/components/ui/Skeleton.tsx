import { cn } from "@/lib/cn";

/** Loading placeholder at the right shape — never a spinner over a whole screen. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-sm bg-subtle motion-reduce:animate-none",
        className,
      )}
    />
  );
}
