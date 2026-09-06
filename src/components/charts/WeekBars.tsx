import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/time";
import type { WeekSummary } from "@/server/services/study";
import type { AccentKey } from "@/lib/tokens";

/**
 * Seven bars, weekdays labelled, today emphasised, stacked by language
 * (DESIGN_BRIEF §5.3).
 *
 * Direct labels, not a colour legend: DESIGN_BRIEF §8 requires charts to be
 * readable by someone who cannot distinguish the accent colours.
 */
export function WeekBars({
  week,
  languages,
}: {
  week: WeekSummary[];
  languages: { id: string; name: string; accentKey: string }[];
}) {
  const days = week[0]?.byDay.map((entry) => entry.day) ?? [];

  if (days.length === 0) {
    return (
      <p className="py-6 text-center text-body-sm text-ink-2">
        Nothing logged this week yet. Start a timer, or log time you did away
        from the screen.
      </p>
    );
  }

  const totals = days.map((day) =>
    week.reduce(
      (sum, entry) =>
        sum + (entry.byDay.find((d) => d.day === day)?.minutes ?? 0),
      0,
    ),
  );
  const peak = Math.max(60, ...totals);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex h-40 items-stretch gap-2">
        {days.map((day, index) => {
          const total = totals[index] ?? 0;
          const isToday = day === today;

          return (
            /*
             * `h-full` is load-bearing. The row uses items-end, so without it
             * each column shrinks to its content height, the inner flex-1 has
             * no definite height, and every bar's `height: N%` resolves
             * against zero — a chart that silently renders nothing.
             */
            <div
              key={day}
              className="flex h-full flex-1 flex-col items-center gap-2"
            >
              <div
                className="flex w-full flex-1 flex-col justify-end gap-px"
                title={`${formatDuration(total * 60)} on ${day}`}
              >
                {week.map((entry) => {
                  const minutes =
                    entry.byDay.find((d) => d.day === day)?.minutes ?? 0;
                  if (minutes === 0) return null;
                  const language = languages.find(
                    (l) => l.id === entry.languageId,
                  );

                  return (
                    <div
                      key={entry.languageId}
                      data-accent={
                        (language?.accentKey ?? "accent-1") as AccentKey
                      }
                      className="w-full rounded-[2px] bg-accent"
                      style={{
                        height: `${Math.max(2, (minutes / peak) * 100)}%`,
                      }}
                    />
                  );
                })}
              </div>

              <span
                className={cn(
                  "text-caption",
                  isToday ? "font-medium text-ink" : "text-ink-3",
                )}
              >
                {new Intl.DateTimeFormat("en-GB", { weekday: "narrow" }).format(
                  new Date(`${day}T12:00:00Z`),
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Direct labels rather than a colour-only legend. */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        {week.map((entry) => {
          const language = languages.find((l) => l.id === entry.languageId);
          if (!language) return null;
          return (
            <li
              key={entry.languageId}
              data-accent={language.accentKey as AccentKey}
              className="flex items-center gap-2 text-caption text-ink-2"
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-accent"
              />
              {language.name} · {formatDuration(entry.actualMinutes * 60)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
