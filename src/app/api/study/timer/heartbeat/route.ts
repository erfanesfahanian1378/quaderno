import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as study from "@/server/services/study";

/**
 * Every 60s while a timer runs. This is what lets the reaper close an
 * abandoned session at its LAST HEARTBEAT rather than at discovery — a closed
 * laptop then costs at most a minute of logged time, not fourteen hours.
 */
export const POST = wrap(async () => {
  const ctx = await requireUser();
  return NextResponse.json(await study.heartbeat(ctx));
});
