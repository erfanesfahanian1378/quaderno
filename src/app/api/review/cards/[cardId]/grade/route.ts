import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as review from "@/server/repositories/review";
import * as users from "@/server/repositories/user";
import { GRADES, schedule } from "@/server/services/review/sm2";
import { dayKeyInZone } from "@/lib/time";
import { withIdempotency } from "@/server/api/idempotency";

type Params = { cardId: string };

const bodySchema = z.object({
  grade: z.enum(GRADES),
  /** Reveal to grade. Optional: it is telemetry, not correctness. */
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

/**
 * Grading is NOT naturally idempotent — replaying it schedules the card a
 * second time and writes a second ReviewLog row, which corrupts the history a
 * future scheduler would learn from. A queued grade that is retried after its
 * response was lost must land exactly once.
 */
export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = bodySchema.parse(await request.json());

  return withIdempotency(ctx, request, `grade:${params.cardId}`, async () => {
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

    return {
      status: 200,
      body: {
        dueOn: next.dueOn,
        intervalDays: next.intervalDays,
        remaining: await review.dueCount(ctx, todayKey),
      },
    };
  });
});
