import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as leaves from "@/server/repositories/leaf";
import { insertLeaf } from "@/server/services/composition";
import { TEMPLATE_KEYS } from "@/server/services/composition/templates";

type Params = { documentId: string };

const createSchema = z.object({
  kind: z.literal("NOTE_PAGE").default("NOTE_PAGE"),
  // null prepends; omitted appends at the end.
  afterLeafId: z.string().min(1).nullable().optional(),
  template: z.enum(TEMPLATE_KEYS).optional(),
  label: z.string().trim().max(120).optional(),
});

export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  return NextResponse.json({
    items: await leaves.listForDocument(ctx, params.documentId),
  });
});

/** Insert a page anywhere — including between two of the teacher's pages. */
export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = createSchema.parse(await request.json());
  const created = await insertLeaf(ctx, params.documentId, input);
  return NextResponse.json(created, { status: 201 });
});
