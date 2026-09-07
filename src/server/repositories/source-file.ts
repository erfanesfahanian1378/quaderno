import { prisma } from "./client";
import type { Ctx } from "./base";

/**
 * SourceFile: the bytes the user gave us, plus the PDF we derived from them.
 *
 * CLAUDE.md rule 8: **never mutate an uploaded file.** The original keeps its
 * own storage key for the life of the document and is always downloadable;
 * every derived artefact gets a new key.
 */

export type SourceFileRow = {
  id: string;
  documentId: string;
  originalName: string;
  mimeType: string;
  byteSize: bigint;
  checksumSha256: string;
  storageKey: string;
  pdfStorageKey: string | null;
  pdfPageCount: number | null;
  conversionEngine: string | null;
  conversionMs: number | null;
  hasTextLayer: boolean;
  ocrApplied: boolean;
};

const FIELDS = {
  id: true,
  documentId: true,
  originalName: true,
  mimeType: true,
  byteSize: true,
  checksumSha256: true,
  storageKey: true,
  pdfStorageKey: true,
  pdfPageCount: true,
  conversionEngine: true,
  conversionMs: true,
  hasTextLayer: true,
  ocrApplied: true,
} as const;

export async function create(input: {
  documentId: string;
  originalName: string;
  mimeType: string;
  byteSize: bigint;
  checksumSha256: string;
  storageKey: string;
}): Promise<SourceFileRow> {
  return prisma.sourceFile.create({ data: input, select: FIELDS });
}

/** Scoped read — joins through Document so a foreign id yields null. */
export async function findById(
  ctx: Ctx,
  id: string,
): Promise<SourceFileRow | null> {
  return prisma.sourceFile.findFirst({
    where: { id, document: { userId: ctx.userId } },
    select: FIELDS,
  });
}

export async function findForDocument(
  ctx: Ctx,
  documentId: string,
): Promise<SourceFileRow[]> {
  return prisma.sourceFile.findMany({
    where: { documentId, document: { userId: ctx.userId } },
    select: FIELDS,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Dedupe: if this user already stored a file with the same checksum, the blob
 * and its converted PDF can be reused and the conversion skipped entirely
 * (DATA_MODEL.md §5).
 */
export async function findByChecksumForUser(
  userId: string,
  checksum: string,
): Promise<SourceFileRow | null> {
  return prisma.sourceFile.findFirst({
    where: {
      checksumSha256: checksum,
      document: { userId },
      pdfStorageKey: { not: null },
    },
    select: FIELDS,
  });
}

/** Worker-side: no ctx, the job already established ownership. */
export async function recordConversion(
  id: string,
  data: {
    pdfStorageKey: string;
    pdfPageCount: number;
    pdfByteSize: bigint;
    conversionEngine: string;
    conversionMs: number;
    hasTextLayer: boolean;
    conversionLog?: string | undefined;
  },
): Promise<void> {
  await prisma.sourceFile.update({ where: { id }, data });
}

export async function appendLog(id: string, line: string): Promise<void> {
  const existing = await prisma.sourceFile.findUnique({
    where: { id },
    select: { conversionLog: true },
  });
  const stamped = `[${new Date().toISOString()}] ${line}`;
  await prisma.sourceFile.update({
    where: { id },
    data: {
      conversionLog: existing?.conversionLog
        ? `${existing.conversionLog}\n${stamped}`
        : stamped,
    },
  });
}

export async function recordStorageKey(
  id: string,
  storageKey: string,
): Promise<void> {
  await prisma.sourceFile.update({ where: { id }, data: { storageKey } });
}

export async function recordChecksum(
  id: string,
  checksumSha256: string,
  byteSize: bigint,
): Promise<void> {
  await prisma.sourceFile.update({
    where: { id },
    data: { checksumSha256, byteSize },
  });
}

/** Swaps in the OCR'd PDF. One transaction, and the original is untouched. */
export async function applyOcr(
  id: string,
  data: { pdfStorageKey: string; hasTextLayer: boolean; log: string },
): Promise<void> {
  const existing = await prisma.sourceFile.findUnique({
    where: { id },
    select: { conversionLog: true },
  });

  await prisma.sourceFile.update({
    where: { id },
    data: {
      pdfStorageKey: data.pdfStorageKey,
      hasTextLayer: data.hasTextLayer,
      ocrApplied: true,
      conversionLog: existing?.conversionLog
        ? `${existing.conversionLog}\n${data.log}`
        : data.log,
    },
  });
}

export async function markOcrApplied(
  id: string,
  hasTextLayer: boolean,
): Promise<void> {
  await prisma.sourceFile.update({
    where: { id },
    data: { ocrApplied: true, hasTextLayer },
  });
}

export async function forJob(id: string) {
  return prisma.sourceFile.findUnique({
    where: { id },
    select: {
      ...FIELDS,
      document: { select: { id: true, userId: true, title: true } },
    },
  });
}
