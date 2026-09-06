"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { addDaysToKey, dateToDayKey, formatDuration } from "@/lib/time";
import type { AccentKey } from "@/lib/tokens";

/**
 * The year heatmap: 53 × 7 cells, four intensity steps derived from the
 * language accent (DESIGN_BRIEF §5.10).
 *
 * Four steps, not a continuous ramp, because a continuous one is unreadable —
 * you cannot tell 40 minutes from 55 by eye, and pretending otherwise makes
 * the chart decorative rather than informative.
 *
 * Reads `StudyDayAggregate` only, never sessions.
 */

const WEEKDAY_LABELS = ["M", "", "W", "", "F", "", "S"];

export function Heatmap({
  data,
  accentKey,
  year,
}: {
  data: { day: string; totalSec: number }[];
  accentKey: string;
  year: number;
}) {
  const [hovered, setHovered] = useState<{
    day: string;
    totalSec: number;
  } | null>(null);

  const { weeks, thresholds, monthLabels } = useMemo(() => {
    const byDay = new Map(data.map((entry) => [entry.day, entry.totalSec]));

    // Start on the Monday on or before 1 January, so every column is a full
    // week and the weekday rows line up.
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const offset = (jan1.getUTCDay() + 6) % 7; // 0 = Monday
    let cursor = dateToDayKey(new Date(jan1.getTime() - offset * 86_400_000));

    const columns: { day: string; totalSec: number; inYear: boolean }[][] = [];
    const labels: { column: number; label: string }[] = [];
    let lastMonth = -1;

    for (let week = 0; week < 53; week += 1) {
      const column: { day: string; totalSec: number; inYear: boolean }[] = [];

      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
        const date = new Date(`${cursor}T00:00:00Z`);
        const month = date.getUTCMonth();

        if (dayOfWeek === 0 && month !== lastMonth && date.getUTCDate() <= 7) {
          labels.push({
            column: week,
            label: new Intl.DateTimeFormat("en-GB", {
              month: "short",
              timeZone: "UTC",
            }).format(date),
          });
          lastMonth = month;
        }

        column.push({
          day: cursor,
          totalSec: byDay.get(cursor) ?? 0,
          inYear: date.getUTCFullYear() === year,
        });

        cursor = addDaysToKey(cursor, 1);
      }

      columns.push(column);
    }

    // Thresholds from the actual distribution rather than fixed minutes: a
    // learner doing 20 minutes a day and one doing three hours should both get
    // a readable chart.
    const active = data
      .map((entry) => entry.totalSec)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);

    const quantile = (fraction: number) =>
      active.length === 0
        ? 0
        : (active[Math.floor(active.length * fraction)] ?? 0);

    return {
      weeks: columns,
      thresholds: [quantile(0.25), quantile(0.5), quantile(0.75)],
      monthLabels: labels,
    };
  }, [data, year]);

  const level = (totalSec: number): 0 | 1 | 2 | 3 | 4 => {
    if (totalSec <= 0) return 0;
    if (totalSec <= (thresholds[0] ?? 0)) return 1;
    if (totalSec <= (thresholds[1] ?? 0)) return 2;
    if (totalSec <= (thresholds[2] ?? 0)) return 3;
    return 4;
  };

  const OPACITY = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div data-accent={accentKey as AccentKey} className="flex flex-col gap-2">
      {/* Scrolls inside its own container; the page body never scrolls sideways. */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px] pl-6">
            {weeks.map((_, index) => {
              const label = monthLabels.find((entry) => entry.column === index);
              return (
                <span
                  key={index}
                  className="w-[11px] shrink-0 text-caption text-ink-3"
                >
                  {label?.label.slice(0, 1) === undefined ? "" : ""}
                </span>
              );
            })}
          </div>

          <div className="flex gap-[3px]">
            <div className="flex w-6 shrink-0 flex-col gap-[3px]">
              {WEEKDAY_LABELS.map((label, index) => (
                <span
                  key={index}
                  className="flex h-[11px] items-center text-[9px] text-ink-3"
                >
                  {label}
                </span>
              ))}
            </div>

            {weeks.map((column, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[3px]">
                {column.map((cell) => (
                  <button
                    key={cell.day}
                    type="button"
                    onMouseEnter={() =>
                      setHovered({ day: cell.day, totalSec: cell.totalSec })
                    }
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() =>
                      setHovered({ day: cell.day, totalSec: cell.totalSec })
                    }
                    onBlur={() => setHovered(null)}
                    aria-label={`${cell.day}: ${cell.totalSec > 0 ? formatDuration(cell.totalSec) : "nothing logged"}`}
                    className={cn(
                      "size-[11px] rounded-[2px] transition-opacity duration-[120ms]",
                      !cell.inYear && "opacity-30",
                    )}
                    style={{
                      background:
                        level(cell.totalSec) === 0
                          ? "var(--bg-inset)"
                          : "var(--accent-base)",
                      opacity: cell.inYear
                        ? level(cell.totalSec) === 0
                          ? 1
                          : OPACITY[level(cell.totalSec)]
                        : 0.25,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="min-h-[19px] text-body-sm text-ink-2" aria-live="polite">
          {hovered
            ? hovered.totalSec > 0
              ? `${formatDuration(hovered.totalSec)} on ${new Intl.DateTimeFormat(
                  "en-GB",
                  { day: "numeric", month: "long", timeZone: "UTC" },
                ).format(new Date(`${hovered.day}T00:00:00Z`))}`
              : `Nothing logged on ${hovered.day}`
            : ""}
        </p>

        <div className="flex items-center gap-1.5 text-caption text-ink-3">
          Less
          {OPACITY.map((opacity, index) => (
            <span
              key={index}
              className="size-[11px] rounded-[2px]"
              style={{
                background:
                  index === 0 ? "var(--bg-inset)" : "var(--accent-base)",
                opacity: index === 0 ? 1 : opacity,
              }}
            />
          ))}
          More
        </div>
      </div>
    </div>
  );
}
