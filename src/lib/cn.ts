/**
 * Class-name joiner. Deliberately not `clsx` + `tailwind-merge`: that is two
 * runtime dependencies (~8 KB) to solve a conflict this codebase avoids by
 * convention — variants own their colours, callers add layout. CLAUDE.md
 * rule 10 says a dependency needs a justification, and this one does not have
 * one.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];

  const walk = (value: ClassValue): void => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, enabled] of Object.entries(value)) {
      if (enabled) out.push(key);
    }
  };

  values.forEach(walk);
  return out.join(" ");
}
