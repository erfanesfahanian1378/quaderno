import type { Ctx } from "@/server/repositories/base";
import * as review from "@/server/repositories/review";
import { parseCards, type ParsedRow } from "./parse";

/**
 * Reconcile a note page's vocabulary tables with its cards.
 *
 * The whole difficulty is matching a parsed row to an existing card when the
 * learner has edited the table. Getting it wrong is not a cosmetic bug: an
 * unmatched row creates a new card, the old one is retired, and a month of
 * review history is gone from the learner's point of view.
 *
 * Two passes, in this order:
 *
 *   1. **By key.** The row's word, lowercased and space-collapsed. This is
 *      the common case — editing a translation, an example or a note leaves
 *      the key untouched, and the card is matched immediately.
 *   2. **By position**, among what is left. This catches the other common
 *      edit: fixing a typo in the word itself. The row is in the same place,
 *      so its card follows it.
 *
 * Anything still unmatched after both passes is genuinely new; any card still
 * unmatched is genuinely gone, and is retired rather than deleted.
 */
export type SyncResult = {
  created: number;
  updated: number;
  retired: number;
  total: number;
};

export async function syncNotePage(
  ctx: Ctx,
  input: {
    notePageId: string;
    content: string;
    languageId: string | null;
    todayKey: string;
  },
): Promise<SyncResult> {
  const rows = parseCards(input.content);
  const existing = await review.forNotePage(ctx, input.notePageId);

  const byKey = new Map(existing.map((card) => [card.rowKey, card]));
  const claimed = new Set<string>();

  const matched = new Map<string, ParsedRow>(); // cardId -> row
  const unmatchedRows: ParsedRow[] = [];

  // Pass 1 — by key.
  for (const row of rows) {
    const card = byKey.get(row.rowKey);
    if (card && !claimed.has(card.id)) {
      claimed.add(card.id);
      matched.set(card.id, row);
    } else {
      unmatchedRows.push(row);
    }
  }

  // Pass 2 — by position, among cards no row has claimed.
  const freeByRow = new Map<number, review.CardRow>();
  for (const card of existing) {
    if (!claimed.has(card.id) && !freeByRow.has(card.row)) {
      freeByRow.set(card.row, card);
    }
  }

  const newRows: ParsedRow[] = [];
  for (const row of unmatchedRows) {
    const card = freeByRow.get(row.row);
    if (card && !claimed.has(card.id)) {
      claimed.add(card.id);
      matched.set(card.id, row);
    } else {
      newRows.push(row);
    }
  }

  // --- Writes ------------------------------------------------------------
  let updated = 0;
  for (const [cardId, row] of matched) {
    const card = existing.find((candidate) => candidate.id === cardId);
    if (!card) continue;

    const unchanged =
      card.row === row.row &&
      card.rowKey === row.rowKey &&
      card.front === row.front &&
      card.back === row.back &&
      card.example === row.example &&
      card.note === row.note &&
      card.languageId === input.languageId &&
      card.retiredAt === null;

    if (unchanged) continue;

    await review.updateContent(ctx, cardId, {
      row: row.row,
      rowKey: row.rowKey,
      front: row.front,
      back: row.back,
      example: row.example,
      note: row.note,
      languageId: input.languageId,
    });
    updated += 1;
  }

  const created = await review.createMany(
    ctx,
    newRows.map((row) => ({
      notePageId: input.notePageId,
      languageId: input.languageId,
      row: row.row,
      rowKey: row.rowKey,
      front: row.front,
      back: row.back,
      example: row.example,
      note: row.note,
      // Due today: a word you have just written down is a word you are
      // trying to learn now.
      dueOn: input.todayKey,
    })),
  );

  const retired = await review.retire(
    ctx,
    existing
      .filter((card) => !claimed.has(card.id) && card.retiredAt === null)
      .map((card) => card.id),
  );

  return { created, updated, retired, total: rows.length };
}
