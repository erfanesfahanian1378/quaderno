import {
  INK_KEYS,
  HIGHLIGHT_KEYS,
  type InkKey,
  type HighlightKey,
} from "./tokens";

/**
 * Formatted text, stored as explicit spans rather than HTML.
 *
 * Editing happens in a `contenteditable`, because browsers already solve
 * selection, IME and mobile carets and nothing hand-rolled will match them.
 * But what comes OUT of a contenteditable is arbitrary user-controlled HTML,
 * and storing that means either sanitising it forever or shipping an XSS.
 *
 * So the DOM is a means, never the record: on commit the text nodes are
 * walked and each one's computed style is read into this structure, and
 * rendering always builds fresh elements from it. There is no path by which
 * a stored string becomes markup.
 *
 * Colours are TOKEN KEYS, never hex — CLAUDE.md rule 5 — so a note written in
 * dark mode is still readable in light mode and in an export.
 */

export const TEXT_FONTS = ["ui", "reading", "mono"] as const;
export type TextFont = (typeof TEXT_FONTS)[number];

export const TEXT_COLOR_KEYS = [...INK_KEYS, ...HIGHLIGHT_KEYS] as const;
export type TextColorKey = InkKey | HighlightKey;

export type TextSpan = {
  /** The run of text. */
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  /** Token key. Absent means the annotation's own colour. */
  c?: TextColorKey;
  f?: TextFont;
};

/** Spans are capped so one annotation cannot become an unbounded payload. */
export const MAX_SPANS = 200;
export const MAX_TEXT_LENGTH = 4000;

export function isTextFont(value: string): value is TextFont {
  return (TEXT_FONTS as readonly string[]).includes(value);
}

export function isTextColorKey(value: string): value is TextColorKey {
  return (TEXT_COLOR_KEYS as readonly string[]).includes(value);
}

/** The plain-text projection. What search indexes and what an export prints. */
export function spansToText(spans: TextSpan[]): string {
  return spans.map((span) => span.t).join("");
}

/**
 * Merge runs that carry identical formatting.
 *
 * A contenteditable produces a new element per keystroke in some browsers, so
 * without this a paragraph of plain typing serialises to two hundred
 * single-character spans and hits the cap for no reason.
 */
export function normaliseSpans(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];

  for (const span of spans) {
    if (!span.t) continue;

    const last = out[out.length - 1];
    if (last && sameFormatting(last, span)) {
      last.t += span.t;
      continue;
    }
    out.push({ ...span });
  }

  return out.slice(0, MAX_SPANS);
}

function sameFormatting(a: TextSpan, b: TextSpan): boolean {
  return (
    !!a.b === !!b.b &&
    !!a.i === !!b.i &&
    !!a.u === !!b.u &&
    a.c === b.c &&
    a.f === b.f
  );
}

/** One span with no formatting. The shape plain text takes. */
export function plainSpans(text: string): TextSpan[] {
  return text ? [{ t: text.slice(0, MAX_TEXT_LENGTH) }] : [];
}

// ---------------------------------------------------------------------------
// Browser-only: reading formatting back out of a contenteditable
// ---------------------------------------------------------------------------

/**
 * Resolved token colour → token key.
 *
 * `execCommand("foreColor")` writes a concrete colour into the DOM, so
 * mapping back is the only way to recover the token. The map is built from
 * the live stylesheet, so it is correct in whichever theme is active — which
 * is the entire reason a note written at night is legible in the morning.
 */
export function buildColorMap(): Map<string, TextColorKey> {
  const map = new Map<string, TextColorKey>();
  if (typeof window === "undefined") return map;

  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);

  try {
    for (const key of TEXT_COLOR_KEYS) {
      probe.style.color = `var(--${key})`;
      const resolved = getComputedStyle(probe).color;
      // First key wins: ink and highlight palettes do not overlap, but a
      // theme could in principle resolve two keys to the same colour, and
      // silently reassigning would move a note's colour on the next edit.
      if (resolved && !map.has(resolved)) map.set(resolved, key);
    }
  } finally {
    probe.remove();
  }

  return map;
}

function fontFromComputed(family: string): TextFont | undefined {
  const lower = family.toLowerCase();
  if (lower.includes("jetbrains") || lower.includes("mono")) return "mono";
  if (lower.includes("source serif") || lower.includes("serif"))
    return "reading";
  if (lower.includes("inter") || lower.includes("sans")) return "ui";
  return undefined;
}

/**
 * Walk a contenteditable and produce spans.
 *
 * Reads COMPUTED style rather than tags, because `execCommand` emits `<b>` in
 * one browser, `<strong>` in another and `<span style="font-weight:bold">`
 * in a third, and a note must not look different depending on where it was
 * written.
 */
export function readSpansFromDom(
  root: HTMLElement,
  colors: Map<string, TextColorKey>,
): TextSpan[] {
  const spans: TextSpan[] = [];
  let remaining = MAX_TEXT_LENGTH;

  /*
   * The baseline is the EDITOR'S OWN computed style, not an assumed default.
   *
   * Getting this wrong is not subtle: the composer renders in `text-ink` and
   * a serif face, so comparing against "ui" and no colour stamped every span
   * — including plain typing — with `c: "ink-black"` and `f: "reading"`. A
   * note would then ignore the annotation's own colour, and a note written in
   * dark mode would carry whatever the dark surface resolved to.
   *
   * Only deviations from this baseline are formatting.
   */
  const base = getComputedStyle(root);
  const baseWeight = Number.parseInt(base.fontWeight, 10) || 400;
  const baseColor = base.color;
  const baseFont = fontFromComputed(base.fontFamily);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (remaining <= 0) break;

    const text = node.nodeValue ?? "";
    if (!text) continue;

    const element = node.parentElement;
    if (!element) continue;

    const style = getComputedStyle(element);

    const weight = Number.parseInt(style.fontWeight, 10);
    const font = fontFromComputed(style.fontFamily);

    const span: TextSpan = { t: text.slice(0, remaining) };
    remaining -= span.t.length;

    if (weight >= 600 && weight > baseWeight) span.b = true;
    if (style.fontStyle === "italic" || style.fontStyle === "oblique")
      span.i = true;
    if (style.textDecorationLine.includes("underline")) span.u = true;

    if (style.color !== baseColor) {
      const colorKey = colors.get(style.color);
      if (colorKey) span.c = colorKey;
    }
    if (font && font !== baseFont) span.f = font;

    spans.push(span);
  }

  /*
   * `<div>` and `<br>` are how a contenteditable represents a new line, and
   * neither produces a text node — so without this, pressing Enter silently
   * loses the break.
   */
  return normaliseSpans(withLineBreaks(root, spans));
}

function withLineBreaks(root: HTMLElement, spans: TextSpan[]): TextSpan[] {
  // Reconstructing exact break positions from a flat walk is fragile, so the
  // breaks are read from `innerText`, which is the browser's own answer to
  // "what does this render as". The spans carry formatting; this carries
  // layout, and the two are zipped by character position.
  const rendered = root.innerText ?? "";
  const flat = spans.map((span) => span.t).join("");
  if (rendered === flat) return spans;

  const out: TextSpan[] = [];
  let index = 0;

  for (const span of spans) {
    let text = "";
    for (const char of span.t) {
      // Emit any line breaks the renderer inserted before this character.
      while (
        index < rendered.length &&
        rendered[index] === "\n" &&
        char !== "\n"
      ) {
        text += "\n";
        index += 1;
      }
      text += char;
      if (rendered[index] === char) index += 1;
    }
    out.push({ ...span, t: text });
  }

  return out;
}
