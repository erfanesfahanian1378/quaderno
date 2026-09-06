import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as comments from "@/server/repositories/comment";

type Params = { commentId: string };

const patchSchema = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  resolved: z.boolean().optional(),
});

export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = patchSchema.parse(await request.json());

  const updated = await comments.update(ctx, params.commentId, {
    body: input.body,
    ...(input.resolved !== undefined
      ? { resolvedAt: input.resolved ? new Date() : null }
      : {}),
  });
  if (!updated) throw notFound("Comment");

  return NextResponse.json(updated);
});

export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  if (!(await comments.softDelete(ctx, params.commentId))) {
    throw notFound("Comment");
  }
  return new NextResponse(null, { status: 204 });
});
