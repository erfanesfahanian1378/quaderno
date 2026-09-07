// @vitest-environment node
import { describe, expect, it, beforeAll } from "vitest";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import {
  drawRichText,
  embedFonts,
  type FontSet,
} from "@/lib/export/richtext-pdf";
import type { TextSpan } from "@/lib/richtext";

/**
 * What actually reaches the page.
 *
 * Reading an exported PDF back visually is not proof: at 15pt in a downscaled
 * preview, Times and Times-Bold look alike, and `pdffonts` lists every font in
 * the document including the ones the note typesetter embedded. So the draw
 * calls are recorded and asserted directly.
 */
let fonts: FontSet;

beforeAll(async () => {
  fonts = await embedFonts(await PDFDocument.create());
});

type Drawn = {
  text: string;
  font: string;
  color: string;
  x: number;
  y: number;
};

function record(spans: TextSpan[], maxWidth = 400): Drawn[] {
  const drawn: Drawn[] = [];
  const lines: { y: number }[] = [];

  const page = {
    drawText(text: string, options: Record<string, unknown>) {
      const color = options.color as {
        red: number;
        green: number;
        blue: number;
      };
      drawn.push({
        text,
        font: (options.font as { name?: string })?.name ?? "?",
        color: `${color.red.toFixed(2)},${color.green.toFixed(2)},${color.blue.toFixed(2)}`,
        x: options.x as number,
        y: options.y as number,
      });
    },
    drawLine(options: Record<string, unknown>) {
      lines.push({ y: (options.start as { y: number }).y });
    },
  } as unknown as PDFPage;

  drawRichText(page, spans, {
    x: 0,
    y: 500,
    maxWidth,
    size: 12,
    fonts,
    baseColor: rgb(0, 0, 0),
    resolveColor: (key) => (key === "ink-rust" ? rgb(1, 0, 0) : rgb(0, 0, 1)),
  });

  return drawn;
}

describe("drawing a formatted note", () => {
  it("uses the bold face for a bold run", () => {
    const drawn = record([{ t: "plain " }, { t: "bold", b: true }]);
    expect(drawn.find((d) => d.text === "plain")?.font).toBe("Times-Roman");
    expect(drawn.find((d) => d.text === "bold")?.font).toBe("Times-Bold");
  });

  it("uses the bold-italic face when a run is both", () => {
    const drawn = record([{ t: "both", b: true, i: true }]);
    expect(drawn[0]?.font).toBe("Times-BoldItalic");
  });

  it("uses the italic face for an italic run", () => {
    expect(record([{ t: "slanted", i: true }])[0]?.font).toBe("Times-Italic");
  });

  it("switches family per run", () => {
    const drawn = record([
      { t: "serif " },
      { t: "sans ", f: "ui" },
      { t: "code", f: "mono" },
    ]);
    expect(drawn.map((d) => d.font)).toEqual([
      "Times-Roman",
      "Helvetica",
      "Courier",
    ]);
  });

  it("combines family and weight", () => {
    expect(record([{ t: "x", f: "ui", b: true, i: true }])[0]?.font).toBe(
      "Helvetica-BoldOblique",
    );
    expect(record([{ t: "x", f: "mono", b: true }])[0]?.font).toBe(
      "Courier-Bold",
    );
  });

  it("paints a run in its own colour and the rest in the base colour", () => {
    const drawn = record([{ t: "black " }, { t: "rust", c: "ink-rust" }]);
    expect(drawn.find((d) => d.text === "black")?.color).toBe("0.00,0.00,0.00");
    expect(drawn.find((d) => d.text === "rust")?.color).toBe("1.00,0.00,0.00");
  });

  it("wraps to a new line and starts it back at the left margin", () => {
    const drawn = record(
      [{ t: "one two three four five six seven eight nine ten" }],
      60,
    );
    const ys = [...new Set(drawn.map((d) => d.y))];
    expect(ys.length).toBeGreaterThan(1);

    // Every line begins at x = 0, not wherever the previous one ended.
    for (const y of ys) {
      const first = drawn.filter((d) => d.y === y)[0];
      expect(first?.x).toBe(0);
    }
  });

  it("emits no draw call for whitespace, only an advance", () => {
    const drawn = record([{ t: "aaaa bbbb cccc dddd" }], 40);
    expect(drawn.length).toBeGreaterThan(0);
    for (const piece of drawn) expect(piece.text.trim()).not.toBe("");
  });

  it("advances past a space rather than swallowing it", () => {
    // Two words must not run together just because the space is not drawn.
    const drawn = record([{ t: "aa bb" }]);
    expect(drawn.map((d) => d.text)).toEqual(["aa", "bb"]);
    expect(drawn[1]!.x).toBeGreaterThan(drawn[0]!.x);
  });

  it("honours a newline the author typed", () => {
    const drawn = record([{ t: "first\nsecond" }]);
    const ys = [...new Set(drawn.map((d) => d.y))];
    expect(ys.length).toBe(2);
  });

  it("replaces characters the standard fonts cannot encode", () => {
    // Times has no CJK. pdf-lib throws on those, which would fail the whole
    // export rather than one word.
    const drawn = record([{ t: "ciao 日本語" }]);
    expect(() => drawn).not.toThrow();
    expect(drawn.map((d) => d.text).join(" ")).toMatch(/\?\?\?/);
  });

  it("keeps accented Latin text, which is the common case here", () => {
    const drawn = record([{ t: "perché però così àèéìòù" }]);
    expect(drawn.map((d) => d.text).join(" ")).toContain("perché");
    expect(drawn.map((d) => d.text).join(" ")).not.toContain("?");
  });
});
