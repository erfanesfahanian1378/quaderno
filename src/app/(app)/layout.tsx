import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as review from "@/server/repositories/review";
import * as users from "@/server/repositories/user";
import { dayKeyInZone } from "@/lib/time";
import { Sidebar } from "@/components/nav/Sidebar";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { TimerPill } from "@/components/study/TimerPill";

/**
 * The authenticated shell. Desktop gets a persistent sidebar; mobile gets a
 * bottom tab bar. Content is capped at 1120px and centred (DESIGN_BRIEF §4).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireUserPage();
  const [list, user] = await Promise.all([
    languages.list(ctx),
    users.findById(ctx),
  ]);

  // Due today, in the user's own zone — "today" is a calendar question.
  const dueCount = await review.dueCount(
    ctx,
    dayKeyInZone(new Date(), user?.timeZone ?? "Europe/Rome"),
  );

  return (
    <div className="flex min-h-dvh">
      <Sidebar languages={list} dueCount={dueCount} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Skip link — DESIGN_BRIEF §8 asks for it to be visible on focus. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2 focus:text-label focus:shadow-e2"
        >
          Skip to content
        </a>

        <main
          id="main"
          className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 pb-24 pt-6 sm:px-8 lg:pb-10"
        >
          {children}
        </main>
      </div>

      {/*
        The running timer follows the user around the app. It sits above the
        mobile tab bar and, on the viewer route, collapses to a dot so it can
        never cover the annotation toolbar (DESIGN_BRIEF §5.9).
      */}
      <TimerPill languages={list} />

      <MobileTabBar />
    </div>
  );
}

export const dynamic = "force-dynamic";
