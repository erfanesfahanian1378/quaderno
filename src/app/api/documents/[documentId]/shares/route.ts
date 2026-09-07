import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as documents from "@/server/repositories/document";
import * as shareLinks from "@/server/repositories/share-link";
import { shareToken } from "@/server/services/share";

type Params = { documentId: string };

const postSchema = z.object({
  label: z.string().max(120).optional(),
  /** Days until it stops working. Omit for a link that does not expire. */
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  // Ownership is proven here, once, before anything is listed.
  const document = await documents.findById(ctx, params.documentId);
  if (!document) throw notFound("Document");

  return NextResponse.json({
    links: await shareLinks.forDocument(ctx, params.documentId),
  });
});

export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = postSchema.parse(await request.json().catch(() => ({})));

  const document = await documents.findById(ctx, params.documentId);
  if (!document) throw notFound("Document");

  const link = await shareLinks.create(ctx, {
    documentId: params.documentId,
    token: shareToken(),
    label: input.label ?? null,
    expiresAt: input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86_400_000)
      : null,
  });

  return NextResponse.json({ link }, { status: 201 });
});
