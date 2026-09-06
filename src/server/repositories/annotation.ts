import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * Annotation repository.
 *
 * The idempotency guarantee lives here: every write is an upsert on
 * `(userId, clientId)`. ANNOTATION_ENGINE.md §7 requires that replaying an
 * outbox after a timeout that actually succeeded is harmless, and a unique
 * index plus upsert is what makes that true by construction rather than by
 * the client being careful.
 */

export type AnnotationRow = {
  id: string;
  clientId: string;
  documentId: string;
  leafId: string;
  kind: string;
  color: string;
  opacity: number;
  zIndex: number;
  geometry: unknown;
  quotedText: string | null;
  textAnchor: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const FIELDS = {
  id: true,
  clientId: true,
  documentId: true,
  leafId: true,
  kind: true,
  color: true,
  opacity: true,
  zIndex: true,
  geometry: true,
  quotedText: true,
  textAnchor: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

/**
 * All live annotations for a document, or — when `since` is given — the delta
 * INCLUDING tombstones, so an offline client can learn that a mark it still
 * holds was deleted elsewhere (DATA_MODEL.md §4).
 */
export async function listForDocument(
  ctx: Ctx,
  documentId: string,
  since?: Date,
): Promise<AnnotationRow[]> {
  return prisma.annotation.findMany({
    where: {
      userId: ctx.userId,
      documentId,
      ...(since
        ? { updatedAt: { gt: since } }
        : // Without `since` this is a first load: tombstones are noise.
          { deletedAt: null }),
    },
    select: FIELDS,
    orderBy: { updatedAt: "asc" },
  });
}

export async function upsertCreate(
  ctx: Ctx,
  input: {
    clientId: string;
    documentId: string;
    leafId: string;
    kind: string;
    color: string;
    opacity: number;
    zIndex: number;
    geometry: Record<string, unknown>;
    quotedText?: string | null | undefined;
    textAnchor?: Record<string, unknown> | null | undefined;
  },
): Promise<AnnotationRow> {
  const data = {
    kind: input.kind as never,
    color: input.color,
    opacity: input.opacity,
    zIndex: input.zIndex,
    geometry: input.geometry as never,
    quotedText: input.quotedText ?? null,
    textAnchor: (input.textAnchor ?? null) as never,
    // A create replayed after a delete un-deletes rather than duplicating.
    deletedAt: null,
  };

  return prisma.annotation.upsert({
    where: {
      userId_clientId: { userId: ctx.userId, clientId: input.clientId },
    },
    create: {
      ...data,
      clientId: input.clientId,
      userId: ctx.userId,
      documentId: input.documentId,
      leafId: input.leafId,
    },
    update: data,
    select: FIELDS,
  });
}

/** Scoped lookup by the client-generated id, used by the update path. */
export async function findByClientId(
  ctx: Ctx,
  clientId: string,
): Promise<AnnotationRow | null> {
  return prisma.annotation.findUnique({
    where: { userId_clientId: { userId: ctx.userId, clientId } },
    select: FIELDS,
  });
}

export async function updateByClientId(
  ctx: Ctx,
  clientId: string,
  data: {
    color?: string | undefined;
    opacity?: number | undefined;
    zIndex?: number | undefined;
    geometry?: Record<string, unknown> | undefined;
  },
): Promise<AnnotationRow | null> {
  const result = await prisma.annotation.updateMany({
    where: { userId: ctx.userId, clientId, deletedAt: null },
    data: {
      ...(data.color ? { color: data.color } : {}),
      ...(data.opacity != null ? { opacity: data.opacity } : {}),
      ...(data.zIndex != null ? { zIndex: data.zIndex } : {}),
      ...(data.geometry ? { geometry: data.geometry as never } : {}),
    },
  });
  if (result.count === 0) return null;

  return prisma.annotation.findFirst({
    where: { userId: ctx.userId, clientId },
    select: FIELDS,
  });
}

/**
 * Soft delete, kept 90 days. An offline client has to be able to learn that a
 * mark it still holds was deleted elsewhere; a hard delete is invisible to it.
 */
export async function softDeleteByClientId(
  ctx: Ctx,
  clientId: string,
): Promise<AnnotationRow | null> {
  const result = await prisma.annotation.updateMany({
    where: { userId: ctx.userId, clientId },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) return null;

  return prisma.annotation.findFirst({
    where: { userId: ctx.userId, clientId },
    select: FIELDS,
  });
}

export async function countForDocument(
  ctx: Ctx,
  documentId: string,
): Promise<number> {
  return prisma.annotation.count({
    where: { userId: ctx.userId, documentId, deletedAt: null },
  });
}

/** Confirms a leaf belongs to a document the user owns, before writing to it. */
export async function leafBelongsToDocument(
  ctx: Ctx,
  leafId: string,
  documentId: string,
): Promise<boolean> {
  const leaf = await prisma.leaf.findFirst({
    where: {
      id: leafId,
      documentId,
      document: { userId: ctx.userId, deletedAt: null },
    },
    select: { id: true },
  });
  return leaf !== null;
}

/** The revision surface: every highlight with its quoted text. */
export async function listHighlights(ctx: Ctx, documentId: string) {
  return prisma.annotation.findMany({
    where: {
      userId: ctx.userId,
      documentId,
      deletedAt: null,
      kind: { in: ["HIGHLIGHT", "UNDERLINE", "STRIKETHROUGH"] },
    },
    select: {
      id: true,
      clientId: true,
      leafId: true,
      kind: true,
      color: true,
      quotedText: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
