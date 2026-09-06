import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as study from "@/server/services/study";

export const GET = wrap(async () => {
  const ctx = await requireUser();
  return NextResponse.json(await study.streak(ctx));
});
