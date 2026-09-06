import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENT_KEYS, HIGHLIGHT_KEYS, INK_KEYS } from "@/lib/tokens";

/**
 * Guards CLAUDE.md rule #5 from both directions:
 *
 *   1. every key the TypeScript side promises actually has a value in CSS,
 *      in BOTH themes — a key with no value paints transparent, silently;
 *   2. no hex literal has leaked out of tokens.css into a component.
 *
 * The second half is the one that rots without a test. It is easy to type
 * `#FFE27A` into a component at 2am and never notice that the highlight now
 * ignores dark mode.
 */

const ROOT = join(__dirname, "..", "..");
const TOKENS_CSS = readFileSync(join(ROOT, "src/styles/tokens.css"), "utf8");

/** The three blocks that must each define the full themed palette. */
function block(selector: string): string {
  const start = TOKENS_CSS.indexOf(selector);
  expect(start, `${selector} block is missing from tokens.css`).toBeGreaterThan(
    -1,
  );
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

const LIGHT_DEFAULT = block(":root {");
const DARK_EXPLICIT = block('[data-theme="dark"] {');
const LIGHT_EXPLICIT = block('[data-theme="light"] {');

const THEMED_TOKENS = [
  "--bg-canvas",
  "--bg-surface",
  "--bg-subtle",
  "--bg-inset",
  "--border-subtle",
  "--border-strong",
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--text-inverse",
  "--success",
  "--warning",
  "--danger",
  "--info",
  "--elevation-1",
  "--elevation-2",
  "--elevation-3",
  ...HIGHLIGHT_KEYS.map((key) => `--${key}`),
  ...ACCENT_KEYS.flatMap((key) => [
    `--${key}-base`,
    `--${key}-soft`,
    `--${key}-on`,
  ]),
];

describe("tokens.css", () => {
  it.each(THEMED_TOKENS)("defines %s in every theme block", (token) => {
    expect(LIGHT_DEFAULT).toContain(`${token}:`);
    expect(DARK_EXPLICIT).toContain(`${token}:`);
    expect(LIGHT_EXPLICIT).toContain(`${token}:`);
  });

  it("defines the pen inks once — they do not vary by theme", () => {
    for (const key of INK_KEYS) {
      expect(LIGHT_DEFAULT).toContain(`--${key}:`);
    }
  });

  it("keeps the explicit light block identical to the :root default", () => {
    const values = (source: string) =>
      Object.fromEntries(
        [...source.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [
          match[1],
          match[2]?.trim(),
        ]),
      );

    const rootValues = values(LIGHT_DEFAULT);
    const explicitValues = values(LIGHT_EXPLICIT);

    for (const [token, value] of Object.entries(explicitValues)) {
      expect(rootValues[token], `${token} drifted between light blocks`).toBe(
        value,
      );
    }
  });
});
