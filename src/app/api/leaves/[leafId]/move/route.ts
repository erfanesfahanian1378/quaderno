import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { moveLeaf } from "@/server/services/composition";

type Params = { leafId: string };

const schema = z.object({ afterLeafId: z.string().min(1).nullable() });

/** Recomputes the fractional index. Exactly one row is written. */
export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const { afterLeafId } = schema.parse(await request.json());
  return NextResponse.json(await moveLeaf(ctx, params.leafId, afterLeafId));
});
