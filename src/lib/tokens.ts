/**
 * Token keys.
 *
 * CLAUDE.md hard rule #5: colours are token KEYS, never hex literals, in the
 * database and in component props. The hex values live only in
 * `src/styles/tokens.css`. This module is the type-level half of that rule —
 * it says which keys exist, and nothing about what colour they are.
 *
 * The indirection is not bureaucracy. The viewer inverts pages in dark mode,
 * so a highlight stored as "hl-yellow" has to resolve to #FFE27A on a white
 * page and #8A7420 on an inverted one. A hex in the database cannot do that.
 */

// ---------------------------------------------------------------------------
// Language accents
// ---------------------------------------------------------------------------

export const ACCENT_KEYS = [
  "accent-1",
  "accent-2",
  "accent-3",
  "accent-4",
  "accent-5",
  "accent-6",
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

/** Display names, shown in the accent picker in settings. */
export const ACCENT_NAMES: Record<AccentKey, string> = {
  "accent-1": "Basil",
  "accent-2": "Indigo",
  "accent-3": "Ochre",
  "accent-4": "Rust",
  "accent-5": "Teal",
  "accent-6": "Plum",
};

export function isAccentKey(value: string): value is AccentKey {
  return (ACCENT_KEYS as readonly string[]).includes(value);
}

/**
 * Assign an accent to a new language by rotating through the six, so a user
 * adding their second language gets a visibly different colour rather than a
 * random collision.
 */
export function nextAccentKey(taken: readonly string[]): AccentKey {
  const free = ACCENT_KEYS.find((key) => !taken.includes(key));
  return free ?? ACCENT_KEYS[taken.length % ACCENT_KEYS.length]!;
}

// ---------------------------------------------------------------------------
// Highlighters
// ---------------------------------------------------------------------------

export const HIGHLIGHT_KEYS = [
  "hl-yellow",
  "hl-green",
  "hl-blue",
  "hl-pink",
  "hl-orange",
] as const;

export type HighlightKey = (typeof HIGHLIGHT_KEYS)[number];

/**
 * Default labels. Users rename these in settings (PHASE-06 §12) and the label
 * travels with the colour into the picker, the annotations list and the
 * export — colour is never the only channel (DESIGN_BRIEF §8).
 */
export const HIGHLIGHT_DEFAULT_LABELS: Record<HighlightKey, string> = {
  "hl-yellow": "grammar",
  "hl-green": "vocabulary",
  "hl-blue": "to review",
  "hl-pink": "important",
  "hl-orange": "question",
};

export function isHighlightKey(value: string): value is HighlightKey {
  return (HIGHLIGHT_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Pen ink
// ---------------------------------------------------------------------------

export const INK_KEYS = [
  "ink-black",
  "ink-rust",
  "ink-blue",
  "ink-green",
] as const;

export type InkKey = (typeof INK_KEYS)[number];

export function isInkKey(value: string): value is InkKey {
  return (INK_KEYS as readonly string[]).includes(value);
}

/** Ink stroke widths, normalised to page height (ANNOTATION_ENGINE §4). */
export const INK_WIDTHS = { fine: 0.002, medium: 0.004, broad: 0.007 } as const;

export type InkWidthKey = keyof typeof INK_WIDTHS;

// ---------------------------------------------------------------------------
// Any colour token an annotation may carry
// ---------------------------------------------------------------------------

export type ColorKey = HighlightKey | InkKey;

/**
 * Resolve a token key to the CSS custom property that carries its value.
 * This is the ONLY sanctioned way to get from a key to a paintable colour in
 * the DOM; it stays a `var()` so the theme still decides the actual hex.
 */
export function cssVar(key: ColorKey): string {
  return `var(--${key})`;
}

/** Accent keys carry three values; pick which one you want. */
export function accentVar(
  key: AccentKey,
  slot: "base" | "soft" | "on" = "base",
): string {
  return `var(--${key}-${slot})`;
}
