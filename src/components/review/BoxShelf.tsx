import { BOXES, boxOf, type BoxNumber } from "@/server/services/review/leitner";
import { cn } from "@/lib/cn";

export type ShelfCard = {
  id: string;
  front: string;
  intervalDays: number;
  reps: number;
  dueOn: string;
};

/**
 * The Leitner shelf: five boxes, and where every card currently sits.
 *
 * This is the motivating view that an interval in days is not. "Fourteen days"
 * says nothing; "this word moved from Shaky to Getting there" is the thing
 * that makes someone come back tomorrow.
 *
 * The boxes are DERIVED from the scheduler, never stored — see leitner.ts.
 * There is one scheduler, so nothing here can drift out of step with what the
 * review screen actually does.
 */
export function BoxShelf({
  cards,
  todayKey,
}: {
  cards: ShelfCard[];
  /** To mark which boxes have something waiting. */
  todayKey: string;
}) {
  if (cards.length === 0) return null;

  const byBox = new Map<BoxNumber, ShelfCard[]>();
  for (const entry of BOXES) byBox.set(entry.box as BoxNumber, []);
  for (const card of cards) byBox.get(boxOf(card))?.push(card);

  const total = cards.length;

  return (
    <section aria-labelledby="boxes-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="boxes-heading" className="text-h3 text-ink">
          Your boxes
        </h2>
        <p className="mt-0.5 text-body-sm text-ink-2">
          Every card you know moves one box to the right. Forget one and it goes
          back to the first.
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {BOXES.map((entry) => {
          const box = entry.box as BoxNumber;
          const inBox = byBox.get(box) ?? [];
          const due = inBox.filter((card) => card.dueOn <= todayKey).length;

          return (
            <li
              key={box}
              className={cn(
                "flex flex-col gap-1 rounded-md border p-3",
                due > 0
                  ? "border-accent/40 bg-accent/5"
                  : "border-hairline bg-surface",
              )}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-caption text-ink-3">Box {box}</span>
                <span className="text-h3 tabular text-ink">{inBox.length}</span>
              </div>

              <span className="text-label text-ink">{entry.name}</span>
              <span className="text-caption text-ink-3">{entry.blurb}</span>

              {/*
                A bar rather than a percentage. The shape of the shelf — most
                cards on the left early on, drifting right over weeks — is the
                progress, and a number cannot show that at a glance.
              */}
              <div
                className="mt-1 h-1 overflow-hidden rounded-full bg-inset"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${total === 0 ? 0 : (inBox.length / total) * 100}%`,
                  }}
                />
              </div>

              {due > 0 ? (
                <span className="text-caption text-accent">{due} due</span>
              ) : (
                <span className="text-caption text-ink-3">nothing due</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
