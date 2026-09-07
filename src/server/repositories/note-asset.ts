import { prisma } from "./client";
import type { Ctx } from "./base";

/** Recorded clips attached to a note page. */

export type NoteAssetRow = {
  id: string;
  notePageId: string;
  documentId: string;
  kind: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  durationMs: number | null;
  label: string | null;
  createdAt: Date;
};

const FIELDS = {
  id: true,
  notePageId: true,
  documentId: true,
  kind: true,
  storageKey: true,
  mimeType: true,
  byteSize: true,
  durationMs: true,
  label: true,
  createdAt: true,
} as const;

export async function create(
  ctx: Ctx,
  data: {
    notePageId: string;
    documentId: string;
    storageKey: string;
    mimeType: string;
    byteSize: number;
    durationMs?: number | null;
    label?: string | null;
  },
): Promise<NoteAssetRow> {
  return prisma.noteAsset.create({
    data: {
      userId: ctx.userId,
      notePageId: data.notePageId,
      documentId: data.documentId,
      storageKey: data.storageKey,
      mimeType: data.mimeType,
      byteSize: data.byteSize,
      durationMs: data.durationMs ?? null,
      label: data.label ?? null,
    },
    select: FIELDS,
  });
}

export async function forNotePage(
  ctx: Ctx,
  notePageId: string,
): Promise<NoteAssetRow[]> {
  return prisma.noteAsset.findMany({
    where: { userId: ctx.userId, notePageId },
    orderBy: { createdAt: "asc" },
    select: FIELDS,
  });
}

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<NoteAssetRow | null> {
  return prisma.noteAsset.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

export async function remove(
  ctx: Ctx,
  id: string,
): Promise<NoteAssetRow | null> {
  const asset = await findById(ctx, id);
  if (!asset) return null;

  await prisma.noteAsset.delete({ where: { id } });
  return asset;
}
