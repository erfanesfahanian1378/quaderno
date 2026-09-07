import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as shareLinks from "@/server/repositories/share-link";

type Params = { shareId: string };

/** Revoke. The link keeps existing as a record; it just stops working. */
export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const revoked = await shareLinks.revoke(ctx, params.shareId);
  // Someone else's link is not found, never forbidden.
  if (!revoked) throw notFound("Share link");

  return NextResponse.json({ revoked: true });
});
