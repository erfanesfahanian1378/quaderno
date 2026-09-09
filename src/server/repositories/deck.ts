import { prisma } from "./client";
import type { Ctx } from "./base";

/** Decks of hand-made flashcards. */

export type DeckRow = {
  id: string;
  languageId: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

const FIELDS = {
  id: true,
  languageId: true,
  name: true,
  description: true,
  createdAt: true,
} as const;

export async function list(
  ctx: Ctx,
  languageId?: string,
): Promise<(DeckRow & { cardCount: number })[]> {
  const rows = await prisma.deck.findMany({
    where: { userId: ctx.userId, ...(languageId ? { languageId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { ...FIELDS, _count: { select: { cards: true } } },
  });

  return rows.map(({ _count, ...row }) => ({
    ...row,
    cardCount: _count.cards,
  }));
}

export async function findById(ctx: Ctx, id: string): Promise<DeckRow | null> {
  return prisma.deck.findFirst({
    where: { id, userId: ctx.userId },
    select: FIELDS,
  });
}

export async function create(
  ctx: Ctx,
  input: { languageId: string; name: string; description?: string | null },
): Promise<DeckRow> {
  return prisma.deck.create({
    data: {
      userId: ctx.userId,
      languageId: input.languageId,
      name: input.name,
      description: input.description ?? null,
    },
    select: FIELDS,
  });
}

export async function update(
  ctx: Ctx,
  id: string,
  data: { name?: string | undefined; description?: string | null | undefined },
): Promise<DeckRow | null> {
  const result = await prisma.deck.updateMany({
    where: { id, userId: ctx.userId },
    data,
  });
  if (result.count === 0) return null;
  return findById(ctx, id);
}

/**
 * Deleting a deck deletes its cards, and says how many before it happens.
 *
 * Unlike a folder — where the contents exist independently and are moved up —
 * a card has no life outside its deck. There is nowhere to move it to, so the
 * only honest options are to take the cards with it or to refuse, and refusing
 * would leave no way to remove a deck at all. The count is what makes it a
 * decision rather than a surprise.
 */
export async function remove(ctx: Ctx, id: string): Promise<number | null> {
  const deck = await findById(ctx, id);
  if (!deck) return null;

  const cards = await prisma.reviewCard.count({
    where: { userId: ctx.userId, deckId: id },
  });

  await prisma.deck.deleteMany({ where: { id, userId: ctx.userId } });
  return cards;
}
