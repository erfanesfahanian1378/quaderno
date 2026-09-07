/**
 * The light-theme value of every colour token, as a hex.
 *
 * The one table both halves of the export share. The browser normally
 * resolves tokens from live computed styles so a dark-mode export keeps the
 * colours its author saw; this is the answer for everywhere that has no
 * theme to read — the worker, and any note whose span names a token the
 * caller could not resolve.
 *
 * Mirrors `:root` in src/styles/tokens.css. tests/unit/tokens-css.spec.ts
 * checks the two agree, so a drift fails the build rather than shipping a
 * silently wrong colour.
 */
export const LIGHT_HEX: Record<string, string> = {
  "hl-yellow": "#ffe27a",
  "hl-green": "#a9e5a0",
  "hl-blue": "#9fd0f5",
  "hl-pink": "#f7a8c4",
  "hl-orange": "#ffc48a",
  "ink-black": "#1c1b18",
  "ink-rust": "#b14a32",
  "ink-blue": "#2c6bb1",
  "ink-green": "#3f7d58",
};
