import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * Comments. Threaded one level deep and resolvable
 * (ANNOTATION_ENGINE.md §5). A comment can hang off a highlight, off a pin, or
 * off the document itself — which is why `leafId` and `annotationId` are both
 * nullable.
 */

const FIELDS = {
  id: true,
  documentId: true,
  leafId: true,
  annotationId: true,
  parentId: true,
  body: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CommentRow = {
  id: string;
  documentId: string;
  leafId: string | null;
  annotationId: string | null;
  parentId: string | null;
  body: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listForDocument(
  ctx: Ctx,
  documentId: string,
  options: { resolved?: boolean | undefined } = {},
): Promise<CommentRow[]> {
  return prisma.comment.findMany({
    where: {
      userId: ctx.userId,
      documentId,
      deletedAt: null,
      ...(options.resolved === false ? { resolvedAt: null } : {}),
      ...(options.resolved === true ? { resolvedAt: { not: null } } : {}),
    },
    select: FIELDS,
    orderBy: { createdAt: "asc" },
  });
}

export async function create(
  ctx: Ctx,
  input: {
    documentId: string;
    body: string;
    leafId?: string | undefined;
    annotationId?: string | undefined;
    parentId?: string | undefined;
  },
): Promise<CommentRow | null> {
  // Ownership is proven through the document, not assumed from the ids.
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, userId: ctx.userId, deletedAt: null },
    select: { id: true },
  });
  if (!document) return null;

  return prisma.comment.create({
    data: {
      userId: ctx.userId,
      documentId: input.documentId,
      body: input.body,
      leafId: input.leafId ?? null,
      annotationId: input.annotationId ?? null,
      // One level of threading only: a reply to a reply attaches to the root.
      parentId: input.parentId ?? null,
    },
    select: FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: { body?: string | undefined; resolvedAt?: Date | null | undefined },
): Promise<CommentRow | null> {
  const result = await prisma.comment.updateMany({
    where: { id, userId: ctx.userId, deletedAt: null },
    data,
  });
  if (result.count === 0) return null;

  return prisma.comment.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

export async function softDelete(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.comment.updateMany({
    where: { id, userId: ctx.userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}
