import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  info: "bg-info-soft text-info-on-soft",
  success: "bg-success-soft text-success-on-soft",
  warning: "bg-warning-soft text-warning-on-soft",
  danger: "bg-danger-soft text-danger-on-soft",
};

const DOTS: Record<Tone, string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Inline banner. Carries a dot AND words — colour is never the only channel
 * (DESIGN_BRIEF §8).
 */
export function Banner({
  tone = "info",
  children,
  className,
  role,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-2.5 rounded-sm px-3 py-2.5 text-body-sm",
        TONES[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOTS[tone])}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
