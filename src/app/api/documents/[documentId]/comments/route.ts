import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as comments from "@/server/repositories/comment";
import { searchParams } from "@/server/api/request";

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

export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = createSchema.parse(await request.json());

  const created = await comments.create(ctx, {
    documentId: params.documentId,
    ...input,
  });
  if (!created) throw notFound("Document");

  return NextResponse.json(created, { status: 201 });
});
