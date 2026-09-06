import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as study from "@/server/services/study";
import { Card, EmptyState } from "@/components/ui";
import { Heatmap } from "@/components/charts/Heatmap";
import { WeekBars } from "@/components/charts/WeekBars";
import { formatDuration } from "@/lib/time";
import type { AccentKey } from "@/lib/tokens";

export const metadata = { title: "Stats" };
export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ languageId?: string }>;
}) {
  const ctx = await requireUserPage("/stats");
  const params = await searchParams;

  const [list, week, heat] = await Promise.all([
    languages.list(ctx),
    study.weekSummary(ctx),
    study.heatmap(ctx, params.languageId),
  ]);

  const year = new Date().getFullYear();
  const totalThisYear = heat.reduce((sum, entry) => sum + entry.totalSec, 0);

  const activeLanguage =
    list.find((entry) => entry.id === params.languageId) ?? list[0];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-reading text-display text-ink">Stats</h1>
        <p className="mt-1 text-body-sm text-ink-2">
          {totalThisYear > 0
            ? `${formatDuration(totalThisYear)} logged in ${year}.`
            : `Nothing logged in ${year} yet.`}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">This week</h2>
        <Card className="p-4">
          <WeekBars week={week} languages={list} />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">{year}</h2>
        <Card className="p-4">
          {heat.length > 0 ? (
            <Heatmap
              data={heat}
              accentKey={activeLanguage?.accentKey ?? "accent-1"}
              year={year}
            />
          ) : (
            <p className="py-6 text-center text-body-sm text-ink-2">
              Once you log some time, this fills in a square per day.
            </p>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">By language</h2>

        {week.length === 0 ? (
          <EmptyState
            title="No hours yet"
            description="Start a timer from the Study tab, or log time you did away from the screen."
          />
        ) : (
          <Card className="divide-y divide-hairline">
            {week.map((entry) => {
              const language = list.find((l) => l.id === entry.languageId);
              const ratio =
                entry.targetMinutes > 0
                  ? Math.min(1, entry.actualMinutes / entry.targetMinutes)
                  : 0;

              return (
                <div
                  key={entry.languageId}
                  data-accent={(language?.accentKey ?? "accent-1") as AccentKey}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <span className="w-28 shrink-0 truncate text-label text-ink">
                    {language?.name ?? "—"}
                  </span>

                  <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-inset">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${ratio * 100}%` }}
                    />
                    {/* The goal, drawn as a reference mark rather than implied. */}
                    {entry.targetMinutes > 0 ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 right-0 w-px bg-hairline-strong"
                      />
                    ) : null}
                  </div>

                  <span className="w-32 shrink-0 text-right text-body-sm tabular text-ink-2">
                    {formatDuration(entry.actualMinutes * 60)}
                    {entry.targetMinutes > 0
                      ? ` of ${formatDuration(entry.targetMinutes * 60)}`
                      : ""}
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
