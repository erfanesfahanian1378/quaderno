import {
  PDFArray,
  type PDFDict,
  PDFName,
  PDFNumber,
  PDFString,
  type PDFDocument,
  type PDFPage,
} from "pdf-lib";
import type { ExportAnnotation } from "./bake";

/**
 * Layered export: **real, editable PDF annotation objects**.
 *
 * pdf-lib has no high-level API for these, so the dictionaries are built from
 * its primitives and pushed onto each page's /Annots. That is the whole
 * reason this flavour was not offered before — and offering a flattened file
 * under the name "layered" would have been a lie.
 *
 * The y-flip is the entire difficulty. Stored geometry is normalised and
 * y-DOWN; PDF user space is y-UP and CropBox-relative. Every coordinate here
 * goes through `place()`, and nothing else in this file does the conversion.
 */

/** Normalised (y-down, 0..1) → PDF user space (y-up, page units). */
function place(page: PDFPage, x: number, y: number): [number, number] {
  const { width, height } = page.getSize();
  return [x * width, height - y * height];
}

function hexToComponents(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function numbers(pdf: PDFDocument, values: number[]): PDFArray {
  const array = PDFArray.withContext(pdf.context);
  for (const value of values) array.push(PDFNumber.of(value));
  return array;
}

/** The keys every annotation dictionary needs to be valid and printable. */
function baseDict(
  pdf: PDFDocument,
  subtype: string,
  rect: number[],
  colorHex: string,
  opacity: number,
  contents: string,
): PDFDict {
  const dict = pdf.context.obj({}) as PDFDict;

  dict.set(PDFName.of("Type"), PDFName.of("Annot"));
  dict.set(PDFName.of("Subtype"), PDFName.of(subtype));
  dict.set(PDFName.of("Rect"), numbers(pdf, rect));
  dict.set(PDFName.of("C"), numbers(pdf, hexToComponents(colorHex)));
  dict.set(PDFName.of("CA"), PDFNumber.of(opacity));
  // Bit 3 = Print. Without it Acrobat shows the mark on screen and omits it
  // from print, which is a confusing way to lose your highlights.
  dict.set(PDFName.of("F"), PDFNumber.of(4));
  dict.set(PDFName.of("Contents"), PDFString.of(contents));
  dict.set(PDFName.of("T"), PDFString.of("Quaderno"));

  return dict;
}

function annotsOf(pdf: PDFDocument, page: PDFPage): PDFArray {
  const existing = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (existing) return existing;

  const created = PDFArray.withContext(pdf.context);
  page.node.set(PDFName.of("Annots"), created);
  return created;
}

/**
 * Adds one annotation to a page as a real PDF object. Returns false for kinds
 * with no sensible PDF equivalent, so the caller can fall back to painting.
 */
export function addLayeredAnnotation(
  pdf: PDFDocument,
  page: PDFPage,
  annotation: ExportAnnotation,
): boolean {
  const { width, height } = page.getSize();
  const annots = annotsOf(pdf, page);

  switch (annotation.kind) {
    case "HIGHLIGHT":
    case "UNDERLINE":
    case "STRIKETHROUGH": {
      const quads =
        (annotation.geometry.quads as
          { x: number; y: number; w: number; h: number }[] | undefined) ?? [];
      if (quads.length === 0) return false;

      const subtype =
        annotation.kind === "HIGHLIGHT"
          ? "Highlight"
          : annotation.kind === "UNDERLINE"
            ? "Underline"
            : "StrikeOut";

      /*
       * QuadPoints: eight numbers per quad, and the order is the one thing
       * everyone gets wrong. It is upper-LEFT, upper-RIGHT, lower-LEFT,
       * lower-RIGHT — not clockwise. Acrobat renders a bow-tie if you go
       * round the rectangle.
       */
      const points: number[] = [];
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const quad of quads) {
        const [x1, yTop] = place(page, quad.x, quad.y);
        const [x2, yBottom] = place(page, quad.x + quad.w, quad.y + quad.h);

        points.push(x1, yTop, x2, yTop, x1, yBottom, x2, yBottom);

        minX = Math.min(minX, x1, x2);
        maxX = Math.max(maxX, x1, x2);
        minY = Math.min(minY, yTop, yBottom);
        maxY = Math.max(maxY, yTop, yBottom);
      }

      const dict = baseDict(
        pdf,
        subtype,
        [minX, minY, maxX, maxY],
        annotation.colorHex,
        annotation.kind === "HIGHLIGHT" ? annotation.opacity : 1,
        annotation.quotedText ?? "",
      );
      dict.set(PDFName.of("QuadPoints"), numbers(pdf, points));

      annots.push(pdf.context.register(dict));
      return true;
    }

    case "INK": {
      const strokes =
        (annotation.geometry.strokes as
          { w: number; points: [number, number][] }[] | undefined) ?? [];
      if (strokes.length === 0) return false;

      const inkList = PDFArray.withContext(pdf.context);
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const stroke of strokes) {
        const flat: number[] = [];
        for (const [nx, ny] of stroke.points) {
          const [x, y] = place(page, nx, ny);
          flat.push(x, y);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        inkList.push(numbers(pdf, flat));
      }

      const pad = (strokes[0]?.w ?? 0.004) * height;
      const dict = baseDict(
        pdf,
        "Ink",
        [minX - pad, minY - pad, maxX + pad, maxY + pad],
        annotation.colorHex,
        annotation.opacity,
        "",
      );
      dict.set(PDFName.of("InkList"), inkList);

      // Border style: /W is the stroke width in page units.
      const borderStyle = pdf.context.obj({}) as PDFDict;
      borderStyle.set(PDFName.of("Type"), PDFName.of("Border"));
      borderStyle.set(PDFName.of("W"), PDFNumber.of(Math.max(0.5, pad)));
      borderStyle.set(PDFName.of("S"), PDFName.of("S"));
      dict.set(PDFName.of("BS"), borderStyle);

      annots.push(pdf.context.register(dict));
      return true;
    }

    case "TEXT_BOX": {
      const box = annotation.geometry as unknown as {
        x: number;
        y: number;
        w: number;
        h: number;
        text: string;
        fontSize: number;
      };

      const [x1, yTop] = place(page, box.x, box.y);
      const [x2, yBottom] = place(page, box.x + box.w, box.y + box.h);
      const size = Math.max(6, box.fontSize * height);
      const [r, g, b] = hexToComponents(annotation.colorHex);

      const dict = baseDict(
        pdf,
        "FreeText",
        [x1, yBottom, x2, yTop],
        annotation.colorHex,
        1,
        box.text,
      );

      /*
       * /DA is not optional. Acrobat renders a FreeText without a default
       * appearance string as an empty box, while Preview renders it fine —
       * which is exactly the kind of difference that ships broken.
       */
      dict.set(
        PDFName.of("DA"),
        PDFString.of(`${r} ${g} ${b} rg /Helv ${size.toFixed(1)} Tf`),
      );
      dict.set(PDFName.of("Q"), PDFNumber.of(0));

      annots.push(pdf.context.register(dict));
      return true;
    }

    case "COMMENT_PIN": {
      const pin = annotation.geometry as unknown as { x: number; y: number };
      const [x, y] = place(page, pin.x, pin.y);

      const dict = baseDict(
        pdf,
        "Text",
        [x - 10, y - 10, x + 10, y + 10],
        annotation.colorHex,
        1,
        annotation.quotedText ?? "Note",
      );
      dict.set(PDFName.of("Name"), PDFName.of("Comment"));
      dict.set(PDFName.of("Open"), pdf.context.obj(false));

      annots.push(pdf.context.register(dict));
      return true;
    }

    default:
      // Shapes have PDF equivalents (/Square, /Circle, /Line) but their
      // appearance streams are fiddly enough that painting them is both
      // simpler and more faithful. The caller falls back.
      void width;
      return false;
  }
}
