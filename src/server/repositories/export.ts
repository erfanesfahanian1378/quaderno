import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * Queued exports. The browser does most of them (ANNOTATION_ENGINE.md §8);
 * these rows exist for the server-side fallback past 150 leaves.
 */

export type ExportRow = {
  id: string;
  documentId: string;
  flavour: string;
  status: string;
  storageKey: string | null;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

const FIELDS = {
  id: true,
  documentId: true,
  flavour: true,
  status: true,
  storageKey: true,
  error: true,
  createdAt: true,
  completedAt: true,
} as const;

export async function create(
  ctx: Ctx,
  documentId: string,
  flavour: string,
): Promise<ExportRow> {
  return prisma.export.create({
    data: { userId: ctx.userId, documentId, flavour },
    select: FIELDS,
  });
}

export async function findById(
  ctx: Ctx,
  id: string,
): Promise<ExportRow | null> {
  return prisma.export.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

// --- Worker side: no ctx, the job established ownership when enqueued ------

export async function forJob(id: string): Promise<ExportRow | null> {
  return prisma.export.findUnique({ where: { id }, select: FIELDS });
}

export async function setStatus(id: string, status: string): Promise<void> {
  await prisma.export.update({ where: { id }, data: { status } });
}

export async function complete(id: string, storageKey: string): Promise<void> {
  await prisma.export.update({
    where: { id },
    data: { status: "READY", storageKey, completedAt: new Date() },
  });
}

export async function fail(id: string, error: string): Promise<void> {
  await prisma.export.update({
    where: { id },
    data: { status: "FAILED", error, completedAt: new Date() },
  });
}

/** Everything the bake needs, in one read. */
export async function gatherDocument(documentId: string, userId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId, deletedAt: null },
    select: {
      title: true,
      sourceFiles: { select: { pdfStorageKey: true } },
      leaves: {
        where: { hidden: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          kind: true,
          sourcePageIndex: true,
          label: true,
          notePage: { select: { content: true } },
        },
      },
    },
  });
  if (!document) return null;

  const annotations = await prisma.annotation.findMany({
    where: { userId, documentId, deletedAt: null },
    select: {
      leafId: true,
      kind: true,
      color: true,
      opacity: true,
      geometry: true,
      quotedText: true,
    },
  });

  const byLeaf = new Map<string, typeof annotations>();
  for (const annotation of annotations) {
    const list = byLeaf.get(annotation.leafId) ?? [];
    list.push(annotation);
    byLeaf.set(annotation.leafId, list);
  }

  return {
    title: document.title,
    pdfStorageKey:
      document.sourceFiles.find((file) => file.pdfStorageKey)?.pdfStorageKey ??
      null,
    leaves: document.leaves.map((leaf) => ({
      id: leaf.id,
      kind: leaf.kind,
      sourcePageIndex: leaf.sourcePageIndex,
      label: leaf.label,
      noteContent: leaf.notePage?.content ?? null,
      annotations: (byLeaf.get(leaf.id) ?? []).map((annotation) => ({
        kind: annotation.kind,
        // The TOKEN KEY. The worker resolves it to a light-theme hex.
        colorHex: annotation.color,
        opacity: annotation.opacity,
        geometry: annotation.geometry as Record<string, unknown>,
        quotedText: annotation.quotedText,
      })),
    })),
  };
}
