import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { applyBatch } from "@/server/services/annotations";
import { batchSchema } from "@/server/validation/annotation";
import { enforce } from "@/server/auth/rate-limit";

type Params = { documentId: string };

/**
 * The main annotation write path. Idempotent on `(userId, clientId)`, at most
 * 50 ops, per-op results — a single bad op must not fail the batch.
 */
export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  await enforce("annotationBatch", ctx.userId);

  const { ops } = batchSchema.parse(await request.json());
  const results = await applyBatch(ctx, params.documentId, ops);

  return NextResponse.json({ results });
});
