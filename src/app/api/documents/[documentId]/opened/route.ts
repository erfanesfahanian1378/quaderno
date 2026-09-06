import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as documents from "@/server/repositories/document";

type Params = { documentId: string };

/** Beacon. Fire-and-forget, so it must be cheap and must not fail loudly. */
export const POST = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  await documents.markOpened(ctx, params.documentId);
  return new NextResponse(null, { status: 204 });
});
