import { cn } from "@/lib/cn";

/** Surface + hairline + e1. Depth comes from one shadow level, never gradients. */
export function Card({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag
      className={cn(
        "rounded-md border border-hairline bg-surface shadow-e1",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
