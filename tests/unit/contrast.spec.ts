import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTRAST, contrastRatio } from "@/lib/contrast";
import { ACCENT_KEYS, HIGHLIGHT_KEYS } from "@/lib/tokens";

/**
 * The contrast audit DESIGN_BRIEF §8 asks to be shown in the deliverable,
 * expressed as a test so it stays true after someone tweaks a swatch.
 *
 * Values are read out of tokens.css rather than duplicated here — a test that
 * carries its own copy of the palette passes happily while the app is broken.
 */

const TOKENS_CSS = readFileSync(
  join(__dirname, "..", "..", "src/styles/tokens.css"),
  "utf8",
);

function blockOf(selector: string): string {
  const start = TOKENS_CSS.indexOf(selector);
  const open = TOKENS_CSS.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < TOKENS_CSS.length; i += 1) {
    if (TOKENS_CSS[i] === "{") depth += 1;
    if (TOKENS_CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return TOKENS_CSS.slice(open, i);
    }
  }
  throw new Error(`unbalanced braces after ${selector}`);
}

function paletteOf(selector: string): Record<string, string> {
  const source = blockOf(selector);
  return Object.fromEntries(
    [...source.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map(
      (match) => [match[1]!, match[2]!],
    ),
  );
}

const LIGHT = paletteOf(":root {");
const DARK = paletteOf('[data-theme="dark"] {');

const THEMES = [
  { name: "light", palette: LIGHT },
  { name: "dark", palette: DARK },
] as const;

describe.each(THEMES)("contrast — $name theme", ({ palette }) => {
  const surface = palette["--bg-surface"]!;
  const canvas = palette["--bg-canvas"]!;

  it("body text clears 4.5:1 on both surface and canvas", () => {
    for (const background of [surface, canvas]) {
      expect(
        contrastRatio(palette["--text-primary"]!, background),
      ).toBeGreaterThanOrEqual(CONTRAST.bodyText);
    }
  });

  it("secondary text clears 4.5:1 — it carries labels and metadata", () => {
    expect(
      contrastRatio(palette["--text-secondary"]!, surface),
    ).toBeGreaterThanOrEqual(CONTRAST.bodyText);
  });

  it("tertiary text clears 3:1 — timestamps and placeholders only", () => {
    expect(
      contrastRatio(palette["--text-tertiary"]!, surface),
    ).toBeGreaterThanOrEqual(CONTRAST.largeText);
  });

  it.each([...ACCENT_KEYS])(
    "%s reads as text on the surface at 4.5:1",
    (key) => {
      expect(
        contrastRatio(palette[`--${key}-base`]!, surface),
      ).toBeGreaterThanOrEqual(CONTRAST.bodyText);
    },
  );

  it.each([...ACCENT_KEYS])("%s `on` reads on its own base at 4.5:1", (key) => {
    expect(
      contrastRatio(palette[`--${key}-on`]!, palette[`--${key}-base`]!),
    ).toBeGreaterThanOrEqual(CONTRAST.bodyText);
  });

  it.each(["--success", "--warning", "--danger", "--info"])(
    "%s soft banner text clears 4.5:1 on its soft background",
    (token) => {
      expect(
        contrastRatio(palette[`${token}-on-soft`]!, palette[`${token}-soft`]!),
      ).toBeGreaterThanOrEqual(CONTRAST.bodyText);
    },
  );
});

/**
 * The highlighter rule is the one that actually constrains the palette: a mark
 * has to be visible against the page AND leave the text under it readable.
 * Page white in light mode; the inverted page in dark mode is the dark
 * surface.
 */
describe("highlighters", () => {
  it.each([...HIGHLIGHT_KEYS])(
    "%s is visible against the page in light mode",
    (key) => {
      expect(
        contrastRatio(LIGHT[`--${key}`]!, LIGHT["--bg-surface"]!),
      ).toBeGreaterThanOrEqual(1.2);
    },
  );

  it.each([...HIGHLIGHT_KEYS])(
    "%s leaves ink readable on top of it in light mode",
    (key) => {
      expect(
        contrastRatio(LIGHT["--text-primary"]!, LIGHT[`--${key}`]!),
      ).toBeGreaterThanOrEqual(CONTRAST.bodyText);
    },
  );

  it.each([...HIGHLIGHT_KEYS])(
    "%s leaves light text readable on an inverted dark page",
    (key) => {
      expect(
        contrastRatio(DARK["--text-primary"]!, DARK[`--${key}`]!),
      ).toBeGreaterThanOrEqual(CONTRAST.bodyText);
    },
  );

  it("keeps the five highlighters distinguishable from one another", () => {
    // Not a WCAG rule, but the whole point of five colours is telling them
    // apart; near-identical luminance in dark mode would defeat that.
    const seen = new Set<string>();
    for (const key of HIGHLIGHT_KEYS) {
      expect(seen.has(DARK[`--${key}`]!)).toBe(false);
      seen.add(DARK[`--${key}`]!);
    }
  });
});
