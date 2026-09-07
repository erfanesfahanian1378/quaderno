import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { conflict, notFound } from "@/server/errors";
import * as documents from "@/server/repositories/document";
import * as sourceFiles from "@/server/repositories/source-file";
import * as languages from "@/server/repositories/language";
import { enqueueOcr } from "@/server/jobs/enqueue";

type Params = { documentId: string };

/**
 * Offered, never automatic (PHASE-04 §7). OCR is slow and memory-hungry, and
 * running it on every upload would spend the box's whole budget on documents
 * that already have text.
 */
export const POST = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const document = await documents.findById(ctx, params.documentId);
  if (!document) throw notFound("Document");

  const files = await sourceFiles.findForDocument(ctx, params.documentId);
  const primary = files.find((file) => file.pdfStorageKey);
  if (!primary) throw notFound("Document file");

  if (primary.hasTextLayer) {
    throw conflict("This document already has selectable text.");
  }
  if (primary.ocrApplied) {
    throw conflict("OCR has already been run on this document.");
  }

  const language = await languages.findById(ctx, document.languageId);

  await enqueueOcr({
    sourceFileId: primary.id,
    documentId: document.id,
    userId: ctx.userId,
    languageCode: language?.code ?? "en",
  });

  return NextResponse.json({ status: "queued" }, { status: 202 });
});
