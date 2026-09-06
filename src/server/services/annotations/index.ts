import { ZodError } from "zod";
import { notFound } from "../../errors";
import type { Ctx } from "../../repositories/base";
import * as annotations from "../../repositories/annotation";
import * as documents from "../../repositories/document";
import {
  parseGeometry,
  type AnnotationKind,
  type BatchOp,
} from "../../validation/annotation";

/**
 * The annotation write path. ANNOTATION_ENGINE.md §7.
 *
 * Two properties matter more than anything else here:
 *
 *   1. **Idempotent.** Every write upserts on `(userId, clientId)`, so a
 *      retry after a timeout that actually succeeded is harmless. The client
 *      cannot know whether its request landed; the server makes it not matter.
 *
 *   2. **One bad op never fails the batch.** Results are per-op. A single
 *      malformed geometry in a batch of fifty must not lose the other
 *      forty-nine — those are somebody's notes.
 */

export type OpResult =
  | { clientId: string; ok: true; id: string; updatedAt: string }
  | {
      clientId: string;
      ok: false;
      error: { code: string; message: string; details?: unknown };
    };

export async function applyBatch(
  ctx: Ctx,
  documentId: string,
  ops: BatchOp[],
): Promise<OpResult[]> {
  // Ownership is checked once, for the document, rather than per op.
  const document = await documents.findById(ctx, documentId);
  if (!document) throw notFound("Document");

  const results: OpResult[] = [];

  for (const op of ops) {
    try {
      results.push(await applyOne(ctx, documentId, op));
    } catch (error) {
      // Deliberately swallowed into a per-op result. See the note above.
      results.push({
        clientId: op.clientId,
        ok: false,
        error:
          error instanceof ZodError
            ? {
                code: "VALIDATION_FAILED",
                message: "That annotation's geometry is not valid",
                details: error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  message: issue.message,
                })),
              }
            : {
                code: "INTERNAL",
                message: "That change could not be saved",
              },
      });
    }
  }

  return results;
}

async function applyOne(
  ctx: Ctx,
  documentId: string,
  op: BatchOp,
): Promise<OpResult> {
  if (op.op === "create") {
    // The leaf has to belong to this document, or an annotation could be
    // attached to a page in someone else's file.
    const belongs = await annotations.leafBelongsToDocument(
      ctx,
      op.leafId,
      documentId,
    );
    if (!belongs) {
      return {
        clientId: op.clientId,
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "That page is not in this document",
        },
      };
    }

    const geometry = parseGeometry(op.kind as AnnotationKind, op.geometry);

    const row = await annotations.upsertCreate(ctx, {
      clientId: op.clientId,
      documentId,
      leafId: op.leafId,
      kind: op.kind,
      color: op.color,
      opacity: op.opacity,
      zIndex: op.zIndex,
      geometry,
      quotedText: op.quotedText ?? null,
      textAnchor: (op.textAnchor ?? null) as Record<string, unknown> | null,
    });

    return {
      clientId: op.clientId,
      ok: true,
      id: row.id,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  if (op.op === "update") {
    // Geometry is only validated when present, and against the kind the row
    // already has — an update never changes an annotation's kind.
    let geometry: Record<string, unknown> | undefined;

    if (op.geometry !== undefined) {
      const existing = await annotations.findByClientId(ctx, op.clientId);
      if (!existing) {
        return {
          clientId: op.clientId,
          ok: false,
          error: { code: "NOT_FOUND", message: "That annotation is gone" },
        };
      }
      geometry = parseGeometry(existing.kind as AnnotationKind, op.geometry);
    }

    const row = await annotations.updateByClientId(ctx, op.clientId, {
      color: op.color,
      opacity: op.opacity,
      zIndex: op.zIndex,
      geometry,
    });

    if (!row) {
      return {
        clientId: op.clientId,
        ok: false,
        error: { code: "NOT_FOUND", message: "That annotation is gone" },
      };
    }

    return {
      clientId: op.clientId,
      ok: true,
      id: row.id,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  const row = await annotations.softDeleteByClientId(ctx, op.clientId);
  if (!row) {
    // Deleting something already gone is a success, not an error — that is
    // what makes an outbox replay safe.
    return {
      clientId: op.clientId,
      ok: true,
      id: op.clientId,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    clientId: op.clientId,
    ok: true,
    id: row.id,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Delta sync. With `since`, tombstones are included. */
export async function listAnnotations(
  ctx: Ctx,
  documentId: string,
  since?: Date,
) {
  const document = await documents.findById(ctx, documentId);
  if (!document) throw notFound("Document");

  const rows = await annotations.listForDocument(ctx, documentId, since);

  return rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    leafId: row.leafId,
    kind: row.kind,
    color: row.color,
    opacity: row.opacity,
    zIndex: row.zIndex,
    geometry: row.geometry,
    quotedText: row.quotedText,
    textAnchor: row.textAnchor,
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  }));
}
