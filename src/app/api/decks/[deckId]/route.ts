import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as decks from "@/server/repositories/deck";

type Params = { deckId: string };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).nullable().optional(),
});

export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = patchSchema.parse(await request.json());

  const updated = await decks.update(ctx, params.deckId, input);
  if (!updated) throw notFound("Deck");
  return NextResponse.json(updated);
});

/** Deletes the deck AND its cards — they have nowhere else to live. */
export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();

  const removed = await decks.remove(ctx, params.deckId);
  if (removed === null) throw notFound("Deck");

  return NextResponse.json({ deletedCards: removed });
});
