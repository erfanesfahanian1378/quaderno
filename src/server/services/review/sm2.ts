import { addDaysToKey } from "@/lib/time";

/**
 * SM-2, the SuperMemo 2 algorithm.
 *
 * Chosen over FSRS deliberately. FSRS schedules better — it is fitted to real
 * review logs rather than to a 1987 guess — but it is a dependency, a model
 * file, and a set of parameters nobody here can debug. SM-2 is forty lines,
 * every constant in it can be explained, and the ReviewLog rows this writes
 * are exactly what FSRS would need as training data if we ever switch. Making
 * that switch possible is the reason the log records the interval and ease on
 * both sides of the grade.
 */

export const GRADES = ["again", "hard", "good", "easy"] as const;
export type Grade = (typeof GRADES)[number];

export function isGrade(value: string): value is Grade {
  return (GRADES as readonly string[]).includes(value);
}

/** SM-2's 0..5 quality scale, mapped from the four buttons a learner sees. */
const QUALITY: Record<Grade, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

/** Below this, the card is a lapse and goes back to the start. */
const PASS_THRESHOLD = 3;

/**
 * The floor on ease. Without it a card failed repeatedly drives its ease
 * toward zero and its interval to one day forever — SuperMemo's own fix.
 */
const MIN_EASE = 1.3;

/** Ease a new card starts at. */
export const INITIAL_EASE = 2.5;

/**
 * Where "Easy" sends a card you got right the first time.
 *
 * Plain SM-2 has no such step: the first interval is one day whatever you
 * answered, so all four buttons read "1 day" and the choice looks like it does
 * nothing. That is a real problem, not a cosmetic one — the buttons only mean
 * something if they visibly differ. Four days is Anki's default for the same
 * reason and the same case.
 */
const EASY_FIRST_INTERVAL = 4;

/** And a multiplier on every later "Easy", so the button keeps its meaning. */
const EASY_BONUS = 1.3;

export type CardState = {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
};

export type Scheduled = CardState & { dueOn: string };

/**
 * Grade a card and return its next state.
 *
 * `todayKey` is a day key in the learner's timezone, not an instant: "due
 * tomorrow" is a calendar claim, and computing it from a timestamp makes it a
 * timezone question that gets a different answer in Auckland.
 */
export function schedule(
  card: CardState,
  grade: Grade,
  todayKey: string,
): Scheduled {
  const quality = QUALITY[grade];

  const ease = Math.max(
    MIN_EASE,
    card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  if (quality < PASS_THRESHOLD) {
    /*
     * A lapse. Repetitions reset, but the ease penalty above is kept — that
     * is what makes a card you keep failing come back more often for good,
     * rather than only until you pass it once.
     */
    return {
      ease,
      intervalDays: 1,
      reps: 0,
      lapses: card.lapses + 1,
      dueOn: addDaysToKey(todayKey, 1),
    };
  }

  const reps = card.reps + 1;

  // The first two intervals are fixed. Multiplying from zero would put every
  // new card a single day out no matter how easy it was.
  let intervalDays: number;
  if (reps === 1) intervalDays = 1;
  else if (reps === 2) intervalDays = 6;
  else intervalDays = Math.round(card.intervalDays * ease);

  /*
   * "Hard" on a passing card should still be a shorter step than "good",
   * which plain SM-2 does not express — it only moves the ease. Damping the
   * interval as well is a small, common adjustment and it is what makes the
   * four buttons feel different from each other.
   */
  if (grade === "hard") {
    intervalDays = Math.max(1, Math.round(intervalDays * 0.6));
  } else if (grade === "easy") {
    intervalDays =
      reps === 1 ? EASY_FIRST_INTERVAL : Math.round(intervalDays * EASY_BONUS);
  }

  intervalDays = Math.max(1, intervalDays);

  return {
    ease,
    intervalDays,
    reps,
    lapses: card.lapses,
    dueOn: addDaysToKey(todayKey, intervalDays),
  };
}

/**
 * What each button will do, for the labels under them.
 *
 * Showing the interval before the choice is most of what makes grading feel
 * like a decision rather than a guess.
 */
export function previewIntervals(
  card: CardState,
  todayKey: string,
): Record<Grade, number> {
  const out = {} as Record<Grade, number>;
  for (const grade of GRADES) {
    out[grade] = schedule(card, grade, todayKey).intervalDays;
  }
  return out;
}
