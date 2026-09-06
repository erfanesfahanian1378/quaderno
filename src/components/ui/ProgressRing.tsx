import { cn } from "@/lib/cn";

/**
 * The weekly goal ring — a ring, not a bar (DESIGN_BRIEF §5.3).
 *
 * Progress is shown as information, not praise: the label states the numbers
 * plainly and there is no celebration until the goal is actually met.
 */
export function ProgressRing({
  value,
  max,
  size = 56,
  strokeWidth = 5,
  label,
  className,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}) {
  const safeMax = Math.max(1, max);
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const complete = ratio >= 1;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(ratio * 100)}% of goal`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-inset)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent-base)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-[220ms] ease-out motion-reduce:transition-none"
        />
      </svg>
      {complete ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center text-caption font-medium text-accent"
        >
          ✓
        </span>
      ) : null}
    </div>
  );
}
