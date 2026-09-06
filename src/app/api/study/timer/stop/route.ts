import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as study from "@/server/services/study";

const schema = z.object({ note: z.string().trim().max(500).optional() });

export const POST = wrap(async (request) => {
  const ctx = await requireUser();
  const body = await request.json().catch(() => ({}));
  const { note } = schema.parse(body);
  return NextResponse.json(await study.stopTimer(ctx, note));
});
