/**
 * The Leitner box, as a view of what the scheduler already knows.
 *
 * A physical Leitner box is five compartments: a card you get right moves up
 * one, a card you get wrong goes back to the first, and the further along it
 * is the less often you see it. That is the same idea SM-2 implements — the
 * difference is that SM-2 expresses it as an interval in days, which is
 * accurate and completely unmotivating to look at.
 *
 * So the boxes are derived, not stored. There is one scheduler, no second set
 * of rules to keep in step, and no card has to restart because a deck was
 * switched to a different mode. `intervalDays` is the honest measure of how
 * well a card is known, and the thresholds below are the standard Leitner
 * doubling — 1, 2, 4, 8, 16 — rounded to where SM-2's own steps land.
 */
export const BOXES = [
  { box: 1, name: "Learning", minInterval: 0, blurb: "Seen today or missed" },
  { box: 2, name: "Shaky", minInterval: 2, blurb: "Coming back in days" },
  { box: 3, name: "Getting there", minInterval: 7, blurb: "About a week out" },
  { box: 4, name: "Solid", minInterval: 21, blurb: "Three weeks or more" },
  { box: 5, name: "Known", minInterval: 60, blurb: "Two months or more" },
] as const;

export type BoxNumber = 1 | 2 | 3 | 4 | 5;

export type CardState = {
  intervalDays: number;
  reps: number;
};

/**
 * Which box a card is in.
 *
 * A card never reviewed is in box 1 regardless of its interval — a new card
 * has not earned a place further along, and showing it as "Known" because its
 * default interval happened to be large would be a lie the whole display
 * rests on.
 */
export function boxOf(card: CardState): BoxNumber {
  if (card.reps === 0) return 1;

  let box: BoxNumber = 1;
  for (const entry of BOXES) {
    if (card.intervalDays >= entry.minInterval) box = entry.box as BoxNumber;
  }
  return box;
}

export function boxName(box: BoxNumber): string {
  return BOXES.find((entry) => entry.box === box)?.name ?? "Learning";
}

/** How many cards sit in each box. Boxes with none are still returned. */
export function tally(cards: CardState[]): Record<BoxNumber, number> {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<BoxNumber, number>;
  for (const card of cards) counts[boxOf(card)] += 1;
  return counts;
}
