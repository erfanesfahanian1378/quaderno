import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as review from "@/server/repositories/review";
import * as users from "@/server/repositories/user";
import { GRADES, schedule } from "@/server/services/review/sm2";
import { dayKeyInZone } from "@/lib/time";

type Params = { cardId: string };

const bodySchema = z.object({
  grade: z.enum(GRADES),
  /** Reveal to grade. Optional: it is telemetry, not correctness. */
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = bodySchema.parse(await request.json());

  const card = await review.findById(ctx, params.cardId);
  // A card belonging to someone else is not found, never forbidden.
  if (!card || card.retiredAt) throw notFound("Card");

  const user = await users.findById(ctx);
  const todayKey = dayKeyInZone(new Date(), user?.timeZone ?? "Europe/Rome");

  const next = schedule(card, input.grade, todayKey);

  await review.applyGrade(
    ctx,
    card.id,
    input.grade,
    next,
    { intervalDays: card.intervalDays },
    input.elapsedMs ?? null,
  );

  return NextResponse.json({
    dueOn: next.dueOn,
    intervalDays: next.intervalDays,
    remaining: await review.dueCount(ctx, todayKey),
  });
});
