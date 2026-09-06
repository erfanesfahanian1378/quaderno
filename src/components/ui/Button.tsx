import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-on hover:opacity-90 disabled:opacity-50",
  secondary:
    "bg-surface text-ink border border-hairline-strong hover:bg-subtle disabled:opacity-50",
  ghost: "bg-transparent text-ink-2 hover:bg-subtle hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  // 44px minimum touch target on md and up — DESIGN_BRIEF §8.
  sm: "h-8 px-3 text-body-sm gap-1.5",
  md: "h-11 px-4 text-label gap-2",
  lg: "h-12 px-5 text-body gap-2",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconOnly?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      iconOnly = false,
      className,
      children,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium",
          "transition-[background-color,opacity,color] duration-[120ms] ease-out",
          "disabled:cursor-not-allowed",
          VARIANTS[variant],
          SIZES[size],
          iconOnly && "aspect-square px-0",
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner /> : null}
        {children}
      </button>
    );
  },
);

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin motion-reduce:animate-none"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
