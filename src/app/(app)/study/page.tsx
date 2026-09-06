import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as repo from "@/server/repositories/study";
import * as study from "@/server/services/study";
import { StudyControls } from "@/components/study/StudyControls";
import { Card, EmptyState } from "@/components/ui";
import { formatDuration } from "@/lib/time";
import type { AccentKey } from "@/lib/tokens";

export const metadata = { title: "Study" };
export const dynamic = "force-dynamic";

export default async function StudyPage() {
  const ctx = await requireUserPage("/study");

  const [list, open, recent, streak] = await Promise.all([
    languages.list(ctx),
    study.getOpenTimer(ctx),
    repo.listSessions(ctx, {}, { limit: 20 }),
    study.streak(ctx),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-reading text-display text-ink">Study</h1>
        <p className="mt-1 text-body-sm text-ink-2">
          Start a timer, or log the studying you did away from the screen.
        </p>
      </header>

      <StudyControls
        languages={list}
        activeTimer={
          open
            ? {
                id: open.id,
                languageId: open.languageId,
                startedAt: open.startedAt.toISOString(),
                activity: open.activity,
              }
            : null
        }
      />

      {/* Streaks stated plainly. No flames, no guilt when one breaks. */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-label text-ink-2">Current streak</p>
          <p className="mt-1 tabular text-display text-ink">
            {streak.current}
            <span className="text-h3 text-ink-2">
              {streak.current === 1 ? " day" : " days"}
            </span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-label text-ink-2">Longest streak</p>
          <p className="mt-1 tabular text-display text-ink">
            {streak.longest}
            <span className="text-h3 text-ink-2">
              {streak.longest === 1 ? " day" : " days"}
            </span>
          </p>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">Recent sessions</h2>

        {recent.items.length === 0 ? (
          <EmptyState
            title="Nothing logged yet"
            description="Time you log here feeds the weekly goal rings on your dashboard."
          />
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-surface">
            {recent.items.map((session) => {
              const language = list.find(
                (entry) => entry.id === session.languageId,
              );
              return (
                <li
                  key={session.id}
                  data-accent={(language?.accentKey ?? "accent-1") as AccentKey}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full bg-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm text-ink">
                      {language?.name ?? "—"} ·{" "}
                      {session.activity.toLowerCase().replace("_", " ")}
                    </p>
                    <p className="text-caption text-ink-3">
                      {new Intl.DateTimeFormat("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(session.startedAt)}
                      {session.source === "TIMER" ? " · timer" : ""}
                      {session.source === "SCHEDULE"
                        ? " · from your schedule"
                        : ""}
                    </p>
                  </div>
                  <span className="tabular text-label text-ink">
                    {session.endedAt
                      ? formatDuration(session.durationSec)
                      : "running"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
