/**
 * WCAG 2.1 relative luminance and contrast.
 *
 * DESIGN_BRIEF §8 makes contrast non-negotiable and requires it **in both
 * themes**: ≥4.5:1 for body text, ≥3:1 for large text, UI borders and chart
 * elements. Highlighter colours additionally have to clear 3:1 against page
 * white AND against the inverted dark-mode page.
 *
 * That is a lot of pairs to check by eye, and eyes are bad at it, so the
 * numbers live here and a test walks every pair.
 */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;

  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** sRGB -> linear, the gamma expansion WCAG specifies. */
function channel(value8bit: number): number {
  const c = value8bit / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb | string): number {
  const { r, g, b } = typeof color === "string" ? parseHex(color) : color;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(
  foreground: Rgb | string,
  background: Rgb | string,
): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export const CONTRAST = {
  /** Body text. */
  bodyText: 4.5,
  /** Large text (≥18.66px bold or ≥24px), UI borders, chart elements. */
  largeText: 3,
} as const;

/**
 * Composite a translucent mark over a background, which is what a highlighter
 * actually is. `opacity` matches `Annotation.opacity` (default 0.4).
 */
export function composite(
  foreground: Rgb | string,
  background: Rgb | string,
  opacity: number,
): Rgb {
  const fg = typeof foreground === "string" ? parseHex(foreground) : foreground;
  const bg = typeof background === "string" ? parseHex(background) : background;
  return {
    r: fg.r * opacity + bg.r * (1 - opacity),
    g: fg.g * opacity + bg.g * (1 - opacity),
    b: fg.b * opacity + bg.b * (1 - opacity),
  };
}
