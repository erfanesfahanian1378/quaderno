import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as documents from "@/server/repositories/document";

type Params = { documentId: string };

/**
 * Put a deleted document back.
 *
 * DELETE has always been a soft delete with a thirty-day window — the comment
 * on it says "users delete class notes by accident" — but nothing could undo
 * it. A retention period no interface can reach is not a safety net, it is a
 * row in a database, and the delete was effectively permanent to the person
 * doing it.
 */
export const POST = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  // Not found covers both "never existed" and "someone else's" — the same
  // answer either way, which is the point.
  if (!(await documents.restore(ctx, params.documentId))) {
    throw notFound("Document");
  }

  return new NextResponse(null, { status: 204 });
});
