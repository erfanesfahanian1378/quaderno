import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as sourceFiles from "@/server/repositories/source-file";
import { getSignedReadUrl } from "@/server/storage";

type Params = { documentId: string };

/**
 * The untouched upload. Always available, even when conversion failed — that
 * is the promise the UI makes on a failed card, and CLAUDE.md rule 8 is what
 * makes it keepable.
 */
export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const files = await sourceFiles.findForDocument(ctx, params.documentId);
  const primary = files[0];
  if (!primary) throw notFound("Document file");

  const signed = await getSignedReadUrl(ctx.userId, primary.storageKey, {
    downloadAs: primary.originalName,
  });
  return NextResponse.json({ url: signed.url, expiresAt: signed.expiresAt });
});
