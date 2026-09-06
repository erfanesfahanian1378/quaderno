import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import { Sidebar } from "@/components/nav/Sidebar";
import { MobileTabBar } from "@/components/nav/MobileTabBar";

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
  const list = await languages.list(ctx);

  return (
    <div className="flex min-h-dvh">
      <Sidebar languages={list} />

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

      <MobileTabBar />
    </div>
  );
}

export const dynamic = "force-dynamic";
