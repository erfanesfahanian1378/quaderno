import { NextResponse } from "next/server";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { searchParams } from "@/server/api/request";
import * as review from "@/server/repositories/review";
import * as users from "@/server/repositories/user";
import { previewIntervals } from "@/server/services/review/sm2";
import { dayKeyInZone } from "@/lib/time";

/** The cards due today, with what each button would do to them. */
export const GET = wrap(async (request) => {
  const ctx = await requireUser();
  const query = searchParams(request);

  const user = await users.findById(ctx);
  const todayKey = dayKeyInZone(new Date(), user?.timeZone ?? "Europe/Rome");

  const languageId = query.get("languageId") ?? undefined;
  const cards = await review.due(ctx, todayKey, {
    ...(languageId ? { languageId } : {}),
    limit: 60,
  });

  return NextResponse.json({
    todayKey,
    total: await review.dueCount(ctx, todayKey, languageId),
    cards: cards.map((card) => ({
      id: card.id,
      front: card.front,
      back: card.back,
      example: card.example,
      note: card.note,
      lapses: card.lapses,
      reps: card.reps,
      // Shown under the buttons, so grading is a decision rather than a guess.
      intervals: previewIntervals(card, todayKey),
    })),
  });
});
