import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * Note pages. `content` is markdown and is the source of truth; `contentJson`
 * is only an editor cache and may be regenerated from it at any time.
 *
 * Ownership is proven by joining through Leaf -> Document, because a NotePage
 * carries no userId of its own.
 */

const FIELDS = {
  id: true,
  content: true,
  format: true,
  pageSize: true,
  orientation: true,
  updatedAt: true,
} as const;

export type NotePageRow = {
  id: string;
  content: string;
  format: string;
  pageSize: string;
  orientation: string;
  updatedAt: Date;
};

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<NotePageRow | null> {
  return prisma.notePage.findFirst({
    where: { id, leaf: { document: { userId: ctx.userId, deletedAt: null } } },
    select: FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: {
    content?: string | undefined;
    pageSize?: string | undefined;
    orientation?: string | undefined;
  },
): Promise<NotePageRow | null> {
  const owned = await findById(ctx, id);
  if (!owned) return null;

  return prisma.notePage.update({
    where: { id },
    data,
    select: FIELDS,
  });
}
