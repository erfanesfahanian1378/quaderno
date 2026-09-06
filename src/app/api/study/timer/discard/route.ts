import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as study from "@/server/services/study";

export const POST = wrap(async () => {
  const ctx = await requireUser();
  await study.discardTimer(ctx);
  return new NextResponse(null, { status: 204 });
});
