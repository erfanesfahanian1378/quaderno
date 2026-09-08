import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as comments from "@/server/repositories/comment";
import { searchParams } from "@/server/api/request";
import { withIdempotency } from "@/server/api/idempotency";

type Params = { documentId: string };

const createSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  leafId: z.string().min(1).optional(),
  annotationId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
});

export const GET = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const resolved = searchParams(request).get("resolved");

  const items = await comments.listForDocument(ctx, params.documentId, {
    resolved: resolved === null ? undefined : resolved === "true",
  });

  return NextResponse.json({ items });
});

/**
 * Creating a comment is not idempotent — a retry after a lost response posts
 * the same note twice, and the reader has no way to tell which is the copy.
 */
export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = createSchema.parse(await request.json());

  return withIdempotency(
    ctx,
    request,
    `comment:${params.documentId}`,
    async () => {
      const created = await comments.create(ctx, {
        documentId: params.documentId,
        ...input,
      });
      if (!created) throw notFound("Document");

      return { status: 201, body: created };
    },
  );
});
