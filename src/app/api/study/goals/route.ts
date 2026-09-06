import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import * as study from "@/server/services/study";

const putSchema = z.object({
  languageId: z.string().min(1),
  targetMinutes: z.number().int().min(0).max(6000),
});

export const GET = wrap(async () => {
  const ctx = await requireUser();
  const goals = await study.goals(ctx);
  return NextResponse.json({
    items: [...goals].map(([languageId, targetMinutes]) => ({
      languageId,
      targetMinutes,
    })),
  });
});

export const PUT = wrap(async (request) => {
  const ctx = await requireUser();
  const input = putSchema.parse(await request.json());
  await study.setGoal(ctx, input.languageId, input.targetMinutes);
  return NextResponse.json({ ok: true });
});
