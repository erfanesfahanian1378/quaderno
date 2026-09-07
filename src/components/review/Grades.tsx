"use client";

import { cn } from "@/lib/cn";
import type { Grade } from "@/server/services/review/sm2";

/**
 * The four buttons.
 *
 * Each carries the interval it will produce. Showing that turns grading from
 * a guess about what the app will do into a decision about what you want —
 * and it is the single thing that makes a scheduler feel trustworthy.
 */
const BUTTONS: {
  grade: Grade;
  label: string;
  hint: string;
  tone: string;
  key: string;
}[] = [
  {
    grade: "again",
    label: "Again",
    hint: "No idea",
    key: "1",
    tone: "border-danger/40 text-danger hover:bg-danger/10",
  },
  {
    grade: "hard",
    label: "Hard",
    hint: "Slowly",
    key: "2",
    tone: "border-hairline text-ink-2 hover:bg-subtle",
  },
  {
    grade: "good",
    label: "Good",
    hint: "Got it",
    key: "3",
    tone: "border-accent/50 text-accent hover:bg-accent/10",
  },
  {
    grade: "easy",
    label: "Easy",
    hint: "Instantly",
    key: "4",
    tone: "border-hairline text-ink-2 hover:bg-subtle",
  },
];

export function formatInterval(days: number): string {
  if (days < 1) return "today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "1 month" : `${months} months`;
  }
  const years = Math.round(days / 36.5) / 10;
  return years === 1 ? "1 year" : `${years} years`;
}

export function Grades({
  intervals,
  onGrade,
  disabled,
}: {
  intervals: Record<Grade, number>;
  onGrade: (grade: Grade) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {BUTTONS.map((button) => (
        <button
          key={button.grade}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(button.grade)}
          className={cn(
            "flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-md border px-3 py-2 transition-colors duration-[120ms] disabled:opacity-50",
            button.tone,
          )}
        >
          <span className="text-label">{button.label}</span>
          <span className="text-caption opacity-70">
            {formatInterval(intervals[button.grade] ?? 1)}
          </span>
        </button>
      ))}
    </div>
  );
}

export const GRADE_KEYS: Record<string, Grade> = {
  "1": "again",
  "2": "hard",
  "3": "good",
  "4": "easy",
};
