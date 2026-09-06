import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as classSessions from "@/server/repositories/class-session";
import * as documents from "@/server/repositories/document";
import * as study from "@/server/services/study";
import * as users from "@/server/repositories/user";
import { Button, Card, EmptyState, ProgressRing } from "@/components/ui";
import { formatDuration } from "@/lib/time";
import type { AccentKey } from "@/lib/tokens";
import { WeekBars } from "@/components/charts/WeekBars";
import { ContinueRow } from "@/components/library/ContinueRow";
import { UploadIcon } from "@/components/nav/icons";

export const metadata = { title: "Today" };

export default async function DashboardPage() {
  const ctx = await requireUserPage("/dashboard");

  const [user, list] = await Promise.all([
    users.findById(ctx),
    languages.list(ctx),
  ]);

  // A brand-new account goes to onboarding rather than an empty dashboard.
  if (list.length === 0) redirect("/onboarding");

  const [week, recent, upcoming] = await Promise.all([
    study.weekSummary(ctx),
    documents.recentlyOpened(ctx, 6),
    classSessions.upcoming(ctx, 1),
  ]);

  const weekByLanguage = new Map(
    week.map((entry) => [entry.languageId, entry]),
  );
  const nextClass = upcoming[0];

  const greeting = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: user?.timeZone ?? "Europe/Rome",
  }).format(new Date());

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-body-sm text-ink-2">{greeting}</p>
        <h1 className="mt-1 font-reading text-display text-ink">
          {user?.name ? `Ciao, ${user.name}` : "Today"}
        </h1>
      </header>

      {/* Goal row — one card per language, a ring not a bar. */}
      <section aria-labelledby="goals-heading" className="flex flex-col gap-3">
        <h2 id="goals-heading" className="text-h3 text-ink">
          This week
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((language) => {
            const summary = weekByLanguage.get(language.id);
            const actual = summary?.actualMinutes ?? 0;
            const target = summary?.targetMinutes ?? 0;
            const pace = summary?.paceMinutes ?? 0;

            return (
              <Card
                key={language.id}
                data-accent={language.accentKey}
                className="p-4"
              >
                <Link
                  href={`/l/${language.id}`}
                  data-accent={language.accentKey as AccentKey}
                  className="flex items-center gap-4"
                >
                  <ProgressRing
                    value={actual}
                    max={target || 1}
                    label={`${actual} of ${target} minutes this week`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-h3 text-ink">{language.name}</p>
                    <p className="mt-0.5 text-body-sm text-ink-2">
                      {target > 0 ? (
                        <>
                          {formatDuration(actual * 60)} of{" "}
                          {formatDuration(target * 60)} —{" "}
                          <PaceLabel paceMinutes={pace} target={target} />
                        </>
                      ) : (
                        <>{formatDuration(actual * 60)} logged · no goal set</>
                      )}
                    </p>
                  </div>
                </Link>
              </Card>
            );
          })}
        </div>
      </section>

      {nextClass ? (
        <section aria-labelledby="next-class" className="flex flex-col gap-3">
          <h2 id="next-class" className="text-h3 text-ink">
            Next class
          </h2>
          <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-h3 text-ink">{nextClass.title}</p>
              <p className="mt-0.5 text-body-sm text-ink-2">
                {new Intl.DateTimeFormat("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                }).format(nextClass.date)}
              </p>
            </div>
            <Link href={`/library?classSessionId=${nextClass.id}`}>
              <Button variant="secondary">
                <UploadIcon className="size-4" />
                Add materials
              </Button>
            </Link>
          </Card>
        </section>
      ) : null}

      <section
        aria-labelledby="continue-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2 id="continue-heading" className="text-h3 text-ink">
            Continue
          </h2>
          <Link href="/library" className="text-body-sm text-accent underline">
            All documents
          </Link>
        </div>

        {recent.length > 0 ? (
          <ContinueRow documents={recent} languages={list} />
        ) : (
          <EmptyState
            title="Nothing opened yet"
            description="Upload a handout, a slide deck or a photo of the whiteboard, and it becomes a document you can mark up."
            action={
              <Link href="/library">
                <Button variant="secondary">Go to your library</Button>
              </Link>
            }
          />
        )}
      </section>

      <section aria-labelledby="week-heading" className="flex flex-col gap-3">
        <h2 id="week-heading" className="text-h3 text-ink">
          Hours this week
        </h2>
        <Card className="p-4">
          <WeekBars week={week} languages={list} />
        </Card>
      </section>
    </div>
  );
}

/**
 * Pace stated plainly. No praise, no guilt — progress is information
 * (DESIGN_BRIEF §2).
 */
function PaceLabel({
  paceMinutes,
  target,
}: {
  paceMinutes: number;
  target: number;
}) {
  if (target === 0) return null;
  if (paceMinutes >= 0) return <span className="text-success">on pace</span>;
  return (
    <span className="text-ink-2">
      behind by {formatDuration(Math.abs(paceMinutes) * 60)}
    </span>
  );
}
