import { z } from "zod";
import { HIGHLIGHT_KEYS, INK_KEYS } from "@/lib/tokens";

/**
 * Annotation geometry schemas — one per kind, per DATA_MODEL.md §6.
 *
 * The rule every schema here enforces: **coordinates are normalised and every
 * one is in [0,1]**. A coordinate outside that range is rejected at the
 * boundary rather than stored, because a stored out-of-range value paints
 * somewhere impossible on every device and there is no good way to recover it
 * later.
 */

/** Colour is a TOKEN KEY, never a hex. CLAUDE.md rule 5. */
const colorSchema = z.enum([...HIGHLIGHT_KEYS, ...INK_KEYS]);

/** A normalised scalar. `.finite()` also rejects NaN and Infinity. */
const unit = z.number().finite().min(0).max(1);

/** Sizes may exceed 1 no more than a coordinate may; a quad has to fit. */
const size = z.number().finite().min(0).max(1);

export const quadSchema = z.object({
  x: unit,
  y: unit,
  w: size,
  h: size,
});

export const textAnchoredGeometry = z.object({
  quads: z.array(quadSchema).min(1).max(500),
});

export const inkGeometry = z.object({
  strokes: z
    .array(
      z.object({
        /** Stroke width as a fraction of page height. */
        w: z.number().finite().min(0.0005).max(0.05),
        points: z
          .array(z.tuple([unit, unit]))
          .min(1)
          // ANNOTATION_ENGINE.md §4 caps a stroke at 2,000 points before an
          // automatic split, to bound the payload.
          .max(2000),
        /** Optional per-point pressure, same length as points. */
        pressure: z.array(z.number().finite().min(0).max(1)).optional(),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * One formatted run inside a text box.
 *
 * Structure, not markup. The editor is a contenteditable, so what the browser
 * hands back is arbitrary user HTML; storing that would mean sanitising it
 * forever. Instead the DOM is read into these fields and rendering rebuilds
 * elements from them, so there is no path by which a stored string becomes
 * markup. See src/lib/richtext.ts.
 */
export const textSpanSchema = z.object({
  t: z.string().max(4000),
  b: z.boolean().optional(),
  i: z.boolean().optional(),
  u: z.boolean().optional(),
  /** A TOKEN KEY, never a hex — the same rule as the annotation's colour. */
  c: colorSchema.optional(),
  f: z.enum(["ui", "reading", "mono"]).optional(),
});

export const textBoxGeometry = z
  .object({
    x: unit,
    y: unit,
    w: size,
    h: size,
    /**
     * The plain-text projection of `spans`, and the only thing search and the
     * PDF export read. Kept in the record rather than derived on the fly so a
     * reader that knows nothing about spans still shows the note.
     */
    text: z.string().max(4000),
    spans: z.array(textSpanSchema).max(200).optional(),
    /** Font size as a fraction of page height, so it scales with zoom. */
    fontSize: z.number().finite().min(0.005).max(0.2),
    align: z.enum(["left", "center", "right"]).default("left"),
  })
  .superRefine((value, ctx) => {
    if (!value.spans) return;

    // A `text` that disagrees with `spans` would show one thing on screen and
    // export another. Reject rather than silently trust one of them.
    const joined = value.spans.map((span) => span.t).join("");
    if (joined !== value.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "text must be exactly the concatenation of spans",
      });
    }
  });

export const shapeGeometry = z.object({
  shape: z.enum(["rect", "ellipse", "line", "arrow"]),
  x1: unit,
  y1: unit,
  x2: unit,
  y2: unit,
  strokeW: z.number().finite().min(0.0005).max(0.05),
});

export const commentPinGeometry = z.object({ x: unit, y: unit });

export const ANNOTATION_KINDS = [
  "HIGHLIGHT",
  "UNDERLINE",
  "STRIKETHROUGH",
  "INK",
  "TEXT_BOX",
  "SHAPE",
  "COMMENT_PIN",
] as const;

export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/** Picks the geometry schema for a kind. */
export function geometrySchemaFor(kind: AnnotationKind) {
  switch (kind) {
    case "HIGHLIGHT":
    case "UNDERLINE":
    case "STRIKETHROUGH":
      return textAnchoredGeometry;
    case "INK":
      return inkGeometry;
    case "TEXT_BOX":
      return textBoxGeometry;
    case "SHAPE":
      return shapeGeometry;
    case "COMMENT_PIN":
      return commentPinGeometry;
  }
}

export const textAnchorSchema = z.object({
  pageIndex: z.number().int().min(0),
  exact: z.string().max(2000),
  prefix: z.string().max(64).optional(),
  suffix: z.string().max(64).optional(),
  startOffset: z.number().int().min(0).optional(),
  endOffset: z.number().int().min(0).optional(),
});

const baseOp = {
  clientId: z.string().uuid(),
};

export const createOpSchema = z.object({
  ...baseOp,
  op: z.literal("create"),
  kind: z.enum(ANNOTATION_KINDS),
  leafId: z.string().min(1),
  color: colorSchema.default("hl-yellow"),
  opacity: z.number().finite().min(0.05).max(1).default(0.4),
  zIndex: z.number().int().min(-1000).max(1000).default(0),
  geometry: z.unknown(),
  quotedText: z.string().max(4000).nullable().optional(),
  textAnchor: textAnchorSchema.nullable().optional(),
});

export const updateOpSchema = z.object({
  ...baseOp,
  op: z.literal("update"),
  color: colorSchema.optional(),
  opacity: z.number().finite().min(0.05).max(1).optional(),
  zIndex: z.number().int().min(-1000).max(1000).optional(),
  geometry: z.unknown().optional(),
});

export const deleteOpSchema = z.object({
  ...baseOp,
  op: z.literal("delete"),
});

export const batchSchema = z.object({
  ops: z
    .array(
      z.discriminatedUnion("op", [
        createOpSchema,
        updateOpSchema,
        deleteOpSchema,
      ]),
    )
    .min(1)
    // ANNOTATION_ENGINE.md §7: at most 50 ops per batch.
    .max(50),
});

export type CreateOp = z.infer<typeof createOpSchema>;
export type UpdateOp = z.infer<typeof updateOpSchema>;
export type DeleteOp = z.infer<typeof deleteOpSchema>;
export type BatchOp = CreateOp | UpdateOp | DeleteOp;

/**
 * Validates geometry against the schema for its kind. Kept separate from the
 * op schema because the correct schema is only known once `kind` is read.
 */
export function parseGeometry(
  kind: AnnotationKind,
  geometry: unknown,
): Record<string, unknown> {
  return geometrySchemaFor(kind).parse(geometry) as Record<string, unknown>;
}
