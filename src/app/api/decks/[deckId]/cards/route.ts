import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as decks from "@/server/repositories/deck";
import * as review from "@/server/repositories/review";
import * as users from "@/server/repositories/user";
import { dayKeyInZone } from "@/lib/time";
import { uuid } from "@/lib/uuid";

type Params = { deckId: string };

const createSchema = z.object({
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(2000),
  example: z.string().trim().max(2000).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const GET = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const deck = await decks.findById(ctx, params.deckId);
  if (!deck) throw notFound("Deck");

  return NextResponse.json({
    deck,
    items: await review.forDeck(ctx, params.deckId),
  });
});

export const POST = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = createSchema.parse(await request.json());

  const deck = await decks.findById(ctx, params.deckId);
  if (!deck) throw notFound("Deck");

  const user = await users.findById(ctx);
  const todayKey = dayKeyInZone(new Date(), user?.timeZone ?? "Europe/Rome");

  const card = await review.createInDeck(ctx, {
    deckId: deck.id,
    languageId: deck.languageId,
    front: input.front,
    back: input.back,
    example: input.example ?? null,
    note: input.note ?? null,
    // Due today: a word you have just written down is one you want to learn.
    dueOn: todayKey,
    /*
     * A key of its own rather than the word.
     *
     * The table reconciler matches rows to cards by their front text; a deck
     * card is derived from nothing and is never re-matched, so a unique key
     * lets the same word be added twice — which is what someone adding cards
     * by hand expects, and what a shared key would silently prevent.
     */
    rowKey: uuid(),
    row: await review.countInDeck(ctx, deck.id),
  });

  return NextResponse.json(card, { status: 201 });
});
