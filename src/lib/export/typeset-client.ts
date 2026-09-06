import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/**
 * A small markdown typesetter over pdf-lib.
 *
 * NOTE: this is a copy of `worker/lib/typeset.ts`. The two are deliberately
 * separate builds of the same logic — the worker's runs in Node during ingest,
 * this one runs in the browser during export — and Next cannot import across
 * that boundary without pulling worker-only modules into the client bundle.
 * If you change one, change the other; the fixture test covers both.
 *
 * ANNOTATION_ENGINE.md §8: "Do not pull in a headless browser for this." A
 * Chrome instance to lay out a page of notes is hundreds of megabytes on a box
 * with 2 GB, so this handles the constrained subset the note editor produces —
 * headings, paragraphs, lists, blockquotes, code, bold/italic — and nothing
 * else.
 *
 * Shared by ingest (txt/md uploads) and by export (note pages baked into a
 * PDF), so a note looks the same whichever path produced it.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { top: 64, bottom: 64, left: 64, right: 64 };

type Style = {
  size: number;
  leading: number;
  bold: boolean;
  italic: boolean;
  mono: boolean;
  spaceBefore: number;
  spaceAfter: number;
  indent: number;
  bullet?: string | undefined;
};

const BODY: Style = {
  size: 11,
  leading: 16,
  bold: false,
  italic: false,
  mono: false,
  spaceBefore: 0,
  spaceAfter: 8,
  indent: 0,
};

function headingStyle(level: number): Style {
  const sizes = [20, 16, 14, 12, 11, 11];
  return {
    ...BODY,
    size: sizes[level - 1] ?? 11,
    leading: (sizes[level - 1] ?? 11) * 1.35,
    bold: true,
    spaceBefore: level === 1 ? 0 : 14,
    spaceAfter: 6,
  };
}

type Block = { text: string; style: Style };

/**
 * Markdown to blocks. Deliberately line-oriented: the editor emits a
 * predictable subset, and a full CommonMark parser is a dependency this does
 * not need.
 */
function parse(source: string, markdown: boolean): Block[] {
  if (!markdown) {
    return source
      .split(/\r?\n/)
      .map((line) => ({ text: line, style: { ...BODY } }));
  }

  const blocks: Block[] = [];
  let inFence = false;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");

    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      blocks.push({
        text: line,
        style: {
          ...BODY,
          mono: true,
          size: 10,
          leading: 14,
          spaceAfter: 0,
          indent: 12,
        },
      });
      continue;
    }

    if (line.trim() === "") {
      blocks.push({ text: "", style: { ...BODY, spaceAfter: 4 } });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        text: heading[2] ?? "",
        style: headingStyle(heading[1]!.length),
      });
      continue;
    }

    const checklist = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (checklist) {
      blocks.push({
        text: checklist[2] ?? "",
        style: {
          ...BODY,
          indent: 16,
          spaceAfter: 3,
          bullet: checklist[1]?.toLowerCase() === "x" ? "[x]" : "[ ]",
        },
      });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({
        text: bullet[1] ?? "",
        style: { ...BODY, indent: 16, spaceAfter: 3, bullet: "•" },
      });
      continue;
    }

    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      blocks.push({
        text: ordered[2] ?? "",
        style: {
          ...BODY,
          indent: 16,
          spaceAfter: 3,
          bullet: `${ordered[1]}.`,
        },
      });
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push({
        text: quote[1] ?? "",
        style: { ...BODY, italic: true, indent: 16 },
      });
      continue;
    }

    // Table rows are rendered as plain text rather than dropped — a
    // vocabulary table should still be readable in an export.
    blocks.push({ text: stripInline(line), style: { ...BODY } });
  }

  return blocks;
}

/** Strips the inline markers the standard fonts cannot express. */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\W)\*(.+?)\*(\W|$)/g, "$1$2$3")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)");
}

/**
 * WinAnsi, which the standard PDF fonts use, covers Latin-1 but not all of
 * Latin Extended-A. `œ` and `Œ` ARE in WinAnsi; a few others are not, and
 * pdf-lib throws on an unencodable character rather than dropping it. Since
 * the app is for Italian and French, the accented vowels must survive — they
 * are all Latin-1 — and anything genuinely outside the encoding is folded
 * rather than allowed to fail the export.
 */
const FOLD: Record<string, string> = {
  Ā: "A",
  ā: "a",
  Ă: "A",
  ă: "a",
  Ą: "A",
  ą: "a",
  Ć: "C",
  ć: "c",
  Č: "C",
  č: "c",
  Ď: "D",
  ď: "d",
  Đ: "D",
  đ: "d",
  Ē: "E",
  ē: "e",
  Ę: "E",
  ę: "e",
  Ě: "E",
  ě: "e",
  Ğ: "G",
  ğ: "g",
  İ: "I",
  ı: "i",
  Ł: "L",
  ł: "l",
  Ń: "N",
  ń: "n",
  Ň: "N",
  ň: "n",
  Ő: "O",
  ő: "o",
  Ŕ: "R",
  ŕ: "r",
  Ř: "R",
  ř: "r",
  Ś: "S",
  ś: "s",
  Ş: "S",
  ş: "s",
  Š: "S",
  š: "s",
  Ţ: "T",
  ţ: "t",
  Ť: "T",
  ť: "t",
  Ū: "U",
  ū: "u",
  Ů: "U",
  ů: "u",
  Ű: "U",
  ű: "u",
  Ź: "Z",
  ź: "z",
  Ż: "Z",
  ż: "z",
  Ž: "Z",
  ž: "z",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
};

export function toEncodable(text: string): string {
  let out = "";
  for (const char of text) {
    if (FOLD[char] !== undefined) {
      out += FOLD[char];
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    // Latin-1 plus the WinAnsi extras we know are safe.
    if (code <= 0xff || char === "Œ" || char === "œ") {
      out += char;
    } else {
      out += "?";
    }
  }
  return out;
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (text === "") return [""];

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);

    // A single word longer than the line (a URL, a long compound) is broken
    // rather than allowed to run off the page.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = "";
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export type TypesetOptions = {
  markdown?: boolean;
  /** Draw onto an existing document instead of creating one (export path). */
  into?: PDFDocument;
};

export async function typesetToPdf(
  source: string,
  options: TypesetOptions = {},
): Promise<Uint8Array> {
  const pdf = options.into ?? (await PDFDocument.create());
  await typesetInto(pdf, source, options.markdown ?? true);
  return pdf.save();
}

/** Lays `source` out as one or more new pages on `pdf`. */
export async function typesetInto(
  pdf: PDFDocument,
  source: string,
  markdown = true,
): Promise<void> {
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const contentWidth = A4.width - MARGIN.left - MARGIN.right;
  let page = pdf.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN.top;

  const newPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN.top;
  };

  for (const block of parse(source, markdown)) {
    const style = block.style;
    const font = style.mono
      ? fonts.mono
      : style.bold
        ? fonts.bold
        : style.italic
          ? fonts.italic
          : fonts.regular;

    y -= style.spaceBefore;

    const text = toEncodable(block.text);
    const available = contentWidth - style.indent;
    const lines = wrap(text, font, style.size, available);

    for (const [index, line] of lines.entries()) {
      if (y - style.leading < MARGIN.bottom) newPage();

      const x = MARGIN.left + style.indent;

      // The bullet sits in the indent, so wrapped lines align under the text.
      if (index === 0 && style.bullet) {
        page.drawText(toEncodable(style.bullet), {
          x: MARGIN.left,
          y: y - style.size,
          size: style.size,
          font: fonts.regular,
          color: rgb(0.35, 0.33, 0.3),
        });
      }

      if (line !== "") {
        page.drawText(line, {
          x,
          y: y - style.size,
          size: style.size,
          font,
          color: rgb(0.11, 0.106, 0.094), // --text-primary
        });
      }

      y -= style.leading;
    }

    y -= style.spaceAfter;
  }
}
