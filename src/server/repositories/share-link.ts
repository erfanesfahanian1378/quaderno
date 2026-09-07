import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * Read-only links to a single document.
 *
 * The rule that governs this whole file: a token resolves to the OWNER's
 * userId, and every read the public route then makes goes through the normal
 * tenant-scoped repositories with that userId. There is no "public" branch in
 * the repository layer, and adding one would be the moment this app grew a
 * way to read someone else's documents.
 */

export type ShareLinkRow = {
  id: string;
  documentId: string;
  token: string;
  label: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  lastSeenAt: Date | null;
  createdAt: Date;
};

const FIELDS = {
  id: true,
  documentId: true,
  token: true,
  label: true,
  expiresAt: true,
  revokedAt: true,
  viewCount: true,
  lastSeenAt: true,
  createdAt: true,
} as const;

export async function create(
  ctx: Ctx,
  data: {
    documentId: string;
    token: string;
    label?: string | null;
    expiresAt?: Date | null;
  },
): Promise<ShareLinkRow> {
  return prisma.shareLink.create({
    data: {
      userId: ctx.userId,
      documentId: data.documentId,
      token: data.token,
      label: data.label ?? null,
      expiresAt: data.expiresAt ?? null,
    },
    select: FIELDS,
  });
}

export async function forDocument(
  ctx: Ctx,
  documentId: string,
): Promise<ShareLinkRow[]> {
  return prisma.shareLink.findMany({
    where: { userId: ctx.userId, documentId },
    orderBy: { createdAt: "desc" },
    select: FIELDS,
  });
}

export async function listAll(
  ctx: Ctx,
): Promise<(ShareLinkRow & { documentTitle: string })[]> {
  const rows = await prisma.shareLink.findMany({
    where: { userId: ctx.userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { ...FIELDS, document: { select: { title: true } } },
  });
  return rows.map(({ document, ...row }) => ({
    ...row,
    documentTitle: document.title,
  }));
}

export async function revoke(ctx: Ctx, id: string): Promise<boolean> {
  const result = await prisma.shareLink.updateMany({
    where: { id, userId: ctx.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// The public side
// ---------------------------------------------------------------------------

/**
 * Resolve a token to the document it grants and the user who owns it.
 *
 * Unscoped by necessity — the caller has no session; the token IS the
 * credential. Everything this returns is then used to scope ordinary reads.
 *
 * Returns null for a token that is unknown, revoked, expired, or whose
 * document has been deleted. All four are the same answer to a visitor: 404.
 * Distinguishing them would confirm that a token once existed.
 */
export async function resolveToken(token: string): Promise<{
  userId: string;
  documentId: string;
  shareLinkId: string;
} | null> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      documentId: true,
      revokedAt: true,
      expiresAt: true,
      document: { select: { deletedAt: true } },
    },
  });

  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt <= new Date()) return null;
  if (link.document.deletedAt) return null;

  return {
    userId: link.userId,
    documentId: link.documentId,
    shareLinkId: link.id,
  };
}

/** Fire-and-forget: a failed counter must never fail a page view. */
export async function recordView(shareLinkId: string): Promise<void> {
  await prisma.shareLink
    .update({
      where: { id: shareLinkId },
      data: { viewCount: { increment: 1 }, lastSeenAt: new Date() },
    })
    .catch(() => undefined);
}
