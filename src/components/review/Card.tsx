"use client";

import { useEffect } from "react";
import { useSpeech } from "@/lib/speech";
import { cn } from "@/lib/cn";

export type ReviewCardData = {
  id: string;
  front: string;
  back: string;
  example: string | null;
  note: string | null;
  lapses: number;
  reps: number;
};

/**
 * One card, front then back.
 *
 * The read-aloud button is on the FRONT, before the answer is shown. Hearing
 * a word you are trying to recall is part of recalling it; hearing it only
 * after the answer is revealed makes it a pronunciation demo instead of a
 * study aid.
 */
export function Card({
  card,
  revealed,
  onReveal,
  languageCode,
}: {
  card: ReviewCardData;
  revealed: boolean;
  onReveal: () => void;
  languageCode: string;
}) {
  const speech = useSpeech(languageCode);

  // Stop mid-word when the card changes; otherwise the previous word is still
  // being said over the next one.
  useEffect(() => speech.cancel, [card.id, speech.cancel]);

  return (
    <div className="flex min-h-[280px] flex-col rounded-lg border border-hairline bg-surface p-6 shadow-e1">
      <div className="flex items-start justify-between gap-3">
        <p className="font-serif text-h2 text-ink">{card.front}</p>

        {speech.supported ? (
          <button
            type="button"
            onClick={() => speech.speak(card.front)}
            aria-label={`Say ${card.front}`}
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full border border-hairline transition-colors duration-[120ms]",
              speech.speaking
                ? "bg-accent/15 text-accent"
                : "text-ink-2 hover:bg-subtle hover:text-ink",
            )}
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a3.5 3.5 0 0 0-2-3.16v6.32A3.5 3.5 0 0 0 16.5 12Z"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {card.lapses > 0 ? (
        <p className="mt-2 text-caption text-ink-3">
          Missed {card.lapses === 1 ? "once" : `${card.lapses} times`} before.
        </p>
      ) : null}

      <div className="mt-6 flex-1">
        {revealed ? (
          <div className="space-y-3">
            <p className="text-h3 text-ink">{card.back}</p>

            {card.example ? (
              <p className="font-serif text-body text-ink-2">{card.example}</p>
            ) : null}

            {card.note ? (
              <p className="text-caption text-ink-3">{card.note}</p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={onReveal}
            className="h-11 w-full rounded-md border border-hairline text-label text-ink-2 transition-colors duration-[120ms] hover:bg-subtle hover:text-ink"
          >
            Show answer
            <span className="ml-2 text-caption text-ink-3">space</span>
          </button>
        )}
      </div>
    </div>
  );
}
