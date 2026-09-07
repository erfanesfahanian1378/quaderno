"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Banner, Button, EmptyState } from "@/components/ui";
import { Card, type ReviewCardData } from "./Card";
import { Grades, GRADE_KEYS, formatInterval } from "./Grades";
import type { Grade } from "@/server/services/review/sm2";

type QueueCard = ReviewCardData & { intervals: Record<Grade, number> };

/**
 * A review session.
 *
 * The queue is fetched once and worked through client-side rather than
 * re-fetched per card. Two reasons: a card should appear the instant you grade
 * the last one, and a session started on a train should survive the tunnel.
 */
export function Session({
  initial,
  total,
  languageCode,
  languageId,
}: {
  initial: QueueCard[];
  total: number;
  languageCode: string;
  languageId?: string;
}) {
  const [queue, setQueue] = useState(initial);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [lastInterval, setLastInterval] = useState<number | null>(null);

  const card = queue[index];
  const remaining = queue.length - index;

  const reveal = useCallback(() => {
    setRevealed(true);
    setRevealedAt(Date.now());
  }, []);

  const grade = useCallback(
    async (value: Grade) => {
      if (!card || busy) return;
      setBusy(true);
      setError(null);

      const result = await api.post<{ intervalDays: number }>(
        `/api/review/cards/${card.id}/grade`,
        {
          grade: value,
          ...(revealedAt ? { elapsedMs: Date.now() - revealedAt } : {}),
        },
      );

      setBusy(false);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setLastInterval(result.data.intervalDays);
      setDone((count) => count + 1);
      setRevealed(false);
      setRevealedAt(null);

      /*
       * "Again" means the card was not learned, so it comes back at the end
       * of this session rather than waiting for tomorrow — that is the whole
       * point of grading it "again" rather than "hard".
       */
      if (value === "again") {
        setQueue((current) => [...current, card]);
      }

      setIndex((current) => current + 1);
    },
    [busy, card, revealedAt],
  );

  // Keyboard: space to reveal, 1-4 to grade. Anki's keys, because anyone who
  // has used a spaced-repetition app already has them in their fingers.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      if (event.key === " " || event.key === "Enter") {
        if (!revealed) {
          event.preventDefault();
          reveal();
        }
        return;
      }

      const mapped = GRADE_KEYS[event.key];
      if (mapped && revealed) {
        event.preventDefault();
        void grade(mapped);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [grade, reveal, revealed]);

  const progress = useMemo(
    () => (total === 0 ? 0 : Math.min(1, done / total)),
    [done, total],
  );

  if (!card) {
    return (
      <EmptyState
        title={done > 0 ? "Done for today" : "Nothing due"}
        description={
          done > 0
            ? `You reviewed ${done} ${done === 1 ? "card" : "cards"}. Come back tomorrow.`
            : "Fill in a vocabulary table on a note page and its rows show up here."
        }
        action={
          languageId ? (
            <a
              href={`/api/review/export?languageId=${languageId}&label=quaderno`}
              className="text-label text-accent underline underline-offset-4"
            >
              Export these cards for Anki
            </a>
          ) : null
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
      <div className="flex items-center justify-between text-caption text-ink-3">
        <span>
          {remaining} left{done > 0 ? ` · ${done} done` : ""}
        </span>
        {lastInterval !== null ? (
          <span>Last card: back in {formatInterval(lastInterval)}</span>
        ) : null}
      </div>

      <div
        className="h-1 overflow-hidden rounded-full bg-subtle"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <Card
        card={card}
        revealed={revealed}
        onReveal={reveal}
        languageCode={languageCode}
      />

      {revealed ? (
        <Grades
          intervals={card.intervals}
          onGrade={(value) => void grade(value)}
          disabled={busy}
        />
      ) : (
        <Button variant="secondary" onClick={reveal} className="w-full">
          Show answer
        </Button>
      )}
    </div>
  );
}
