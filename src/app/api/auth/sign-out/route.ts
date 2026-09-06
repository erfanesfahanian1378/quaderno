import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { destroyCurrentSession } from "@/server/auth/session";

export const POST = wrap(async () => {
  await destroyCurrentSession();
  return NextResponse.json({ ok: true });
});
