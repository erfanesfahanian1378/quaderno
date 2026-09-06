import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { listAnnotations } from "@/server/services/annotations";
import { searchParams } from "@/server/api/request";

type Params = { documentId: string };

/**
 * `?since=<ISO>` turns this into a delta including tombstones, which is how an
 * offline client learns that a mark it still holds was deleted elsewhere.
 */
export const GET = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const since = searchParams(request).get("since");

  const items = await listAnnotations(
    ctx,
    params.documentId,
    since ? new Date(since) : undefined,
  );

  return NextResponse.json({ items, serverTime: new Date().toISOString() });
});
