import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as leaves from "@/server/repositories/leaf";
import { hideLeaf } from "@/server/services/composition";

type Params = { leafId: string };

const patchSchema = z.object({
  label: z.string().trim().max(120).nullable().optional(),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional(),
  hidden: z.boolean().optional(),
});

export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = patchSchema.parse(await request.json());
  if (!(await leaves.update(ctx, params.leafId, input))) throw notFound("Page");
  return NextResponse.json(await leaves.findById(ctx, params.leafId));
});

/**
 * Hides the leaf. A source page is NEVER removed — positions and annotation
 * anchors have to stay stable (DATA_MODEL.md §4).
 */
export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  await hideLeaf(ctx, params.leafId);
  return new NextResponse(null, { status: 204 });
});
