import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/api/wrap";
import { requireUser } from "@/server/auth/guards";
import { notFound } from "@/server/errors";
import * as review from "@/server/repositories/review";

type Params = { cardId: string };

const patchSchema = z.object({
  front: z.string().trim().min(1).max(2000).optional(),
  back: z.string().trim().min(1).max(2000).optional(),
  example: z.string().trim().max(2000).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

/**
 * Edit a hand-made card.
 *
 * A card parsed out of a vocabulary table is not editable here and returns
 * not-found: the page owns it, and the next save of that page would undo the
 * edit. The place to change it is the table.
 */
export const PATCH = wrap<Params>(async (request, { params }) => {
  const ctx = await requireUser();
  const input = patchSchema.parse(await request.json());

  const updated = await review.editCard(ctx, params.cardId, input);
  if (!updated) throw notFound("Card");
  return NextResponse.json(updated);
});

export const DELETE = wrap<Params>(async (_request, { params }) => {
  const ctx = await requireUser();
  if (!(await review.deleteCard(ctx, params.cardId))) throw notFound("Card");
  return NextResponse.json({ deleted: true });
});
