import {
  BlendMode,
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { drawRichText, embedFonts, type FontSet } from "./richtext-pdf";
import { LIGHT_HEX } from "./palette";
import type { TextSpan } from "@/lib/richtext";

/**
 * Baking annotations into a PDF. ANNOTATION_ENGINE.md §8.
 *
 * This runs **in the browser**, in a web worker, because a server-side export
 * is worth roughly 2 GB-seconds of CPU per document on a box that has none to
 * spare (ARCHITECTURE.md §2). The server only takes over past 150 leaves.
 *
 * Coordinates arrive normalised and y-DOWN; PDF user space is y-UP. That flip
 * happens in `place()` and nowhere else in this file.
 */

export type ExportFlavour = "flattened" | "layered" | "notes-only";

export type ExportLeaf = {
  id: string;
  kind: "SOURCE_PAGE" | "NOTE_PAGE";
  sourcePageIndex: number | null;
  label: string | null;
  noteContent: string | null;
  annotations: ExportAnnotation[];
};

export type ExportAnnotation = {
  kind: string;
  /** Resolved hex — the token has already been looked up for the theme. */
  colorHex: string;
  opacity: number;
  geometry: Record<string, unknown>;
  quotedText?: string | null;
};

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;

  return rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  );
}

/** Normalised (y-down) → PDF user space (y-up) for a given page. */
function place(page: PDFPage, x: number, y: number): { x: number; y: number } {
  const { width, height } = page.getSize();
  return { x: x * width, y: height - y * height };
}

function drawAnnotation(
  page: PDFPage,
  annotation: ExportAnnotation,
  fonts: FontSet,
  resolveToken: (key: string) => string,
): void {
  const { width, height } = page.getSize();
  const color = hexToRgb(annotation.colorHex);

  switch (annotation.kind) {
    case "HIGHLIGHT": {
      const quads =
        (annotation.geometry.quads as
          { x: number; y: number; w: number; h: number }[] | undefined) ?? [];

      for (const quad of quads) {
        const origin = place(page, quad.x, quad.y + quad.h);
        page.drawRectangle({
          x: origin.x,
          y: origin.y,
          width: quad.w * width,
          height: quad.h * height,
          color,
          opacity: annotation.opacity,
          // Multiply keeps the text underneath readable rather than washing
          // it out, which is what a real highlighter does.
          blendMode: BlendMode.Multiply,
        });
      }
      return;
    }

    case "UNDERLINE":
    case "STRIKETHROUGH": {
      const quads =
        (annotation.geometry.quads as
          { x: number; y: number; w: number; h: number }[] | undefined) ?? [];

      for (const quad of quads) {
        const offset =
          annotation.kind === "UNDERLINE" ? quad.h * 0.08 : quad.h * 0.45;
        const start = place(page, quad.x, quad.y + quad.h - offset);

        page.drawLine({
          start,
          end: { x: start.x + quad.w * width, y: start.y },
          thickness: Math.max(0.75, quad.h * height * 0.08),
          color,
        });
      }
      return;
    }

    case "INK": {
      const strokes =
        (annotation.geometry.strokes as
          { w: number; points: [number, number][] }[] | undefined) ?? [];

      for (const stroke of strokes) {
        const thickness = Math.max(0.5, stroke.w * height);

        // pdf-lib has no polyline primitive, so the stroke is drawn as
        // segments. At the point counts RDP leaves us with (~60), this is
        // cheap and visually identical to a curve.
        for (let i = 1; i < stroke.points.length; i += 1) {
          const previous = stroke.points[i - 1]!;
          const current = stroke.points[i]!;

          page.drawLine({
            start: place(page, previous[0], previous[1]),
            end: place(page, current[0], current[1]),
            thickness,
            color,
            opacity: annotation.opacity,
          });
        }
      }
      return;
    }

    case "SHAPE": {
      const shape = annotation.geometry as unknown as {
        shape: "rect" | "ellipse" | "line" | "arrow";
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        strokeW: number;
      };
      const thickness = Math.max(0.5, shape.strokeW * height);

      if (shape.shape === "rect") {
        const bottomLeft = place(
          page,
          Math.min(shape.x1, shape.x2),
          Math.max(shape.y1, shape.y2),
        );
        page.drawRectangle({
          x: bottomLeft.x,
          y: bottomLeft.y,
          width: Math.abs(shape.x2 - shape.x1) * width,
          height: Math.abs(shape.y2 - shape.y1) * height,
          borderColor: color,
          borderWidth: thickness,
        });
        return;
      }

      if (shape.shape === "ellipse") {
        const centre = place(
          page,
          (shape.x1 + shape.x2) / 2,
          (shape.y1 + shape.y2) / 2,
        );
        page.drawEllipse({
          x: centre.x,
          y: centre.y,
          xScale: (Math.abs(shape.x2 - shape.x1) / 2) * width,
          yScale: (Math.abs(shape.y2 - shape.y1) / 2) * height,
          borderColor: color,
          borderWidth: thickness,
        });
        return;
      }

      page.drawLine({
        start: place(page, shape.x1, shape.y1),
        end: place(page, shape.x2, shape.y2),
        thickness,
        color,
      });
      return;
    }

    case "TEXT_BOX": {
      const box = annotation.geometry as unknown as {
        x: number;
        y: number;
        w: number;
        text: string;
        spans?: TextSpan[];
        fontSize: number;
      };
      const origin = place(page, box.x, box.y);
      const size = Math.max(6, box.fontSize * height);

      if (box.spans && box.spans.length > 0) {
        // Formatted. Wrapping happens per run, because the runs have
        // different fonts and pdf-lib can only wrap one.
        drawRichText(page, box.spans, {
          x: origin.x,
          y: origin.y,
          maxWidth: box.w * width,
          size,
          fonts,
          baseColor: color,
          resolveColor: (key) => hexToRgb(resolveToken(key)),
        });
        return;
      }

      page.drawText(box.text, {
        x: origin.x,
        y: origin.y - size,
        size,
        color,
        maxWidth: box.w * width,
        lineHeight: size * 1.35,
      });
      return;
    }

    case "COMMENT_PIN": {
      const pin = annotation.geometry as unknown as { x: number; y: number };
      const centre = place(page, pin.x, pin.y);
      page.drawCircle({
        x: centre.x,
        y: centre.y,
        size: 6,
        color,
      });
      return;
    }

    default:
      return;
  }
}

/**
 * Builds the export.
 *
 * `sourcePdf` may be null for a NATIVE document, whose leaves are all note
 * pages — there is deliberately no second code path for those.
 */
/** Loaded lazily: only a layered export pays for the dictionary builder. */
const layered = () => import("./layered");

export async function bakeExport(options: {
  sourcePdf: Uint8Array | null;
  leaves: ExportLeaf[];
  flavour: ExportFlavour;
  title: string;
  typesetNote: (pdf: PDFDocument, markdown: string) => Promise<void>;
  /**
   * Token key to hex, for the colours inside a formatted note.
   *
   * The annotation's own colour arrives already resolved as `colorHex`, but a
   * note's spans carry token KEYS, and those have to be resolved wherever the
   * export is being built: the browser reads live computed styles so a note
   * exported from dark mode keeps the colours its author saw, and the worker
   * uses the light table because a Node process has no theme.
   */
  resolveToken?: ((key: string) => string) | undefined;
}): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  output.setTitle(options.title);
  output.setCreator("Quaderno");

  // Embedded once for the whole document, not once per note.
  const fonts = await embedFonts(output);
  const resolveToken =
    options.resolveToken ?? ((key: string) => LIGHT_HEX[key] ?? "#1C1B18");

  const source = options.sourcePdf
    ? await PDFDocument.load(options.sourcePdf, { ignoreEncryption: true })
    : null;

  const leaves =
    options.flavour === "notes-only"
      ? options.leaves.filter((leaf) => leaf.kind === "NOTE_PAGE")
      : options.leaves;

  for (const leaf of leaves) {
    if (leaf.kind === "SOURCE_PAGE" && source && leaf.sourcePageIndex != null) {
      const [copied] = await output.copyPages(source, [leaf.sourcePageIndex]);
      if (!copied) continue;
      const page = output.addPage(copied);

      for (const annotation of leaf.annotations) {
        if (options.flavour === "layered") {
          // Real, editable annotation objects. Falls through to painting for
          // the kinds with no good PDF equivalent, so a layered export is
          // never missing a mark.
          const { addLayeredAnnotation } = await layered();
          if (addLayeredAnnotation(output, page, annotation)) continue;
        }
        drawAnnotation(page, annotation, fonts, resolveToken);
      }
      continue;
    }

    if (leaf.kind === "NOTE_PAGE") {
      const before = output.getPageCount();
      await options.typesetNote(output, leaf.noteContent ?? "");

      // Annotations on a note page land on the first page it produced.
      const page = output.getPage(before);
      if (page) {
        for (const annotation of leaf.annotations) {
          if (options.flavour === "layered") {
            const { addLayeredAnnotation } = await layered();
            if (addLayeredAnnotation(output, page, annotation)) continue;
          }
          drawAnnotation(page, annotation, fonts, resolveToken);
        }
      }
    }
  }

  if (output.getPageCount() === 0) {
    const page = output.addPage();
    const font = await output.embedFont(StandardFonts.TimesRoman);
    page.drawText("This export has no pages.", {
      x: 64,
      y: page.getHeight() - 96,
      size: 12,
      font,
    });
  }

  return output.save();
}
