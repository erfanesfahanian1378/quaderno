import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { conflict, notFound } from "@/server/errors";
import * as sourceFiles from "@/server/repositories/source-file";
import * as documents from "@/server/repositories/document";
import { getSignedReadUrl } from "@/server/storage";

type Params = { documentId: string };

/**
 * A 5-minute signed URL for the normalised PDF, straight from object storage.
 * The bytes never pass through Node — this handler returns one string
 * (ARCHITECTURE.md §2).
 */
export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const document = await documents.findById(ctx, params.documentId);
  if (!document) throw notFound("Document");

  if (document.status !== "READY") {
    throw conflict("That document is still being prepared.", {
      status: document.status,
    });
  }

  const files = await sourceFiles.findForDocument(ctx, params.documentId);
  const primary = files.find((file) => file.pdfStorageKey);
  if (!primary?.pdfStorageKey) throw notFound("Document file");

  const signed = await getSignedReadUrl(ctx.userId, primary.pdfStorageKey);
  return NextResponse.json({
    url: signed.url,
    expiresAt: signed.expiresAt,
    pageCount: primary.pdfPageCount,
    hasTextLayer: primary.hasTextLayer,
  });
});
