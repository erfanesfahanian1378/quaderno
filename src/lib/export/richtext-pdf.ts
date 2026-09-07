import {
  StandardFonts,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { TextSpan } from "@/lib/richtext";

/**
 * Drawing a formatted note into a PDF.
 *
 * `page.drawText` handles wrapping for ONE style. A note whose second half is
 * bold and red is several styles, so the wrapping has to happen here: measure
 * each word in its own font, break lines at the box width, then draw each run
 * at the x it actually starts at.
 *
 * Without this an exported note keeps its words and loses every colour and
 * weight the author chose — which, for a feature whose whole point is
 * choosing them, is the same as not having it.
 */

/** The 14 standard fonts need no embedding and render everywhere. */
export type FontSet = {
  ui: { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont };
  reading: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
  };
  mono: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
  };
};

/**
 * Embed once per document.
 *
 * Helvetica, Times and Courier are the closest standard equivalents of the
 * app's sans, serif and mono. Embedding the real faces would mean shipping
 * four weights across three families of font binaries into every export for
 * a handful of words.
 */
export async function embedFonts(document: PDFDocument): Promise<FontSet> {
  const faces = await Promise.all([
    document.embedFont(StandardFonts.Helvetica),
    document.embedFont(StandardFonts.HelveticaBold),
    document.embedFont(StandardFonts.HelveticaOblique),
    document.embedFont(StandardFonts.HelveticaBoldOblique),
    document.embedFont(StandardFonts.TimesRoman),
    document.embedFont(StandardFonts.TimesRomanBold),
    document.embedFont(StandardFonts.TimesRomanItalic),
    document.embedFont(StandardFonts.TimesRomanBoldItalic),
    document.embedFont(StandardFonts.Courier),
    document.embedFont(StandardFonts.CourierBold),
    document.embedFont(StandardFonts.CourierOblique),
    document.embedFont(StandardFonts.CourierBoldOblique),
  ]);

  const at = (index: number): PDFFont => faces[index]!;

  return {
    ui: { regular: at(0), bold: at(1), italic: at(2), boldItalic: at(3) },
    reading: { regular: at(4), bold: at(5), italic: at(6), boldItalic: at(7) },
    mono: { regular: at(8), bold: at(9), italic: at(10), boldItalic: at(11) },
  };
}

function fontFor(fonts: FontSet, span: TextSpan): PDFFont {
  const family = fonts[span.f ?? "reading"] ?? fonts.reading;
  if (span.b && span.i) return family.boldItalic;
  if (span.b) return family.bold;
  if (span.i) return family.italic;
  return family.regular;
}

type Piece = {
  text: string;
  span: TextSpan;
  font: PDFFont;
  width: number;
};

/**
 * pdf-lib throws on a character a standard font cannot encode, and a language
 * note is precisely where one turns up. WinAnsi covers Latin-1; anything past
 * it becomes a question mark. Losing a glyph beats losing the document.
 */
const ENCODABLE = /^[ -ÿ\n\r\t]*$/;

function sanitise(text: string): string {
  if (ENCODABLE.test(text)) return text;
  return text.replace(/[^ -ÿ\n\r\t]/g, "?");
}

function widthOf(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    // A rough estimate beats failing the export over one glyph.
    return text.length * size * 0.5;
  }
}

/**
 * Split spans into words, keeping each word's formatting with it.
 *
 * Whitespace is kept as its own piece rather than trimmed, because a run
 * boundary can fall mid-word and dropping the space between two runs would
 * silently join words that were separate.
 */
function toPieces(spans: TextSpan[], fonts: FontSet, size: number): Piece[] {
  const pieces: Piece[] = [];

  for (const span of spans) {
    const font = fontFor(fonts, span);
    for (const chunk of span.t.split(/(\s+)/)) {
      if (!chunk) continue;
      const text = sanitise(chunk);
      pieces.push({ text, span, font, width: widthOf(font, text, size) });
    }
  }

  return pieces;
}

/**
 * Draw the spans inside the box, wrapping at `maxWidth`.
 *
 * A box that overflows its declared height is left to overflow: clipping
 * would drop words the author wrote, and the height was only ever an estimate
 * taken from the composer at the moment they typed.
 */
export function drawRichText(
  page: PDFPage,
  spans: TextSpan[],
  options: {
    x: number;
    /** The TOP of the first line, in PDF user space. */
    y: number;
    maxWidth: number;
    size: number;
    fonts: FontSet;
    /** Used by any span that names no colour of its own. */
    baseColor: RGB;
    resolveColor: (key: string) => RGB;
  },
): void {
  const { x, y, maxWidth, size, fonts, baseColor, resolveColor } = options;
  const lineHeight = size * 1.35;

  let cursorX = x;
  let cursorY = y - size;
  let lineStart = true;

  for (const piece of toPieces(spans, fonts, size)) {
    // A newline in the text is a break the author typed.
    if (piece.text.includes("\n")) {
      cursorX = x;
      cursorY -= lineHeight * (piece.text.match(/\n/g)?.length ?? 1);
      lineStart = true;
      continue;
    }

    const isSpace = /^\s+$/.test(piece.text);
    // A line never begins with the space that ended the previous one.
    if (isSpace && lineStart) continue;

    if (!isSpace && !lineStart && cursorX + piece.width > x + maxWidth) {
      cursorX = x;
      cursorY -= lineHeight;
      lineStart = true;
    }

    const color = piece.span.c ? resolveColor(piece.span.c) : baseColor;

    // A space only has to advance the cursor. Emitting a text-showing
    // operator for it would put a run of nothing into the content stream for
    // every gap between two words.
    if (!isSpace) {
      page.drawText(piece.text, {
        x: cursorX,
        y: cursorY,
        size,
        font: piece.font,
        color,
      });
    }

    if (piece.span.u && !isSpace) {
      // Standard fonts carry no underline, so it is drawn. A tenth of the
      // size below the baseline is where a text renderer puts it.
      page.drawLine({
        start: { x: cursorX, y: cursorY - size * 0.1 },
        end: { x: cursorX + piece.width, y: cursorY - size * 0.1 },
        thickness: Math.max(0.4, size * 0.05),
        color,
      });
    }

    cursorX += piece.width;
    lineStart = false;
  }
}
