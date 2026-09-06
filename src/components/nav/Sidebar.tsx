"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { AccentKey } from "@/lib/tokens";
import {
  ChartIcon,
  ClockIcon,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
} from "./icons";

export type SidebarLanguage = {
  id: string;
  name: string;
  accentKey: string;
  cefrLevel: string | null;
};

/** Persistent 240px left sidebar on desktop. Sits outside the content grid. */
export function Sidebar({ languages }: { languages: SidebarLanguage[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[var(--sidebar-width)] shrink-0 flex-col gap-6 border-r border-hairline bg-surface px-3 py-5 lg:flex"
    >
      <Link href="/dashboard" className="px-2 font-reading text-h2 text-ink">
        Quaderno
      </Link>

      <div className="flex flex-col gap-0.5">
        <NavLink href="/dashboard" active={pathname === "/dashboard"}>
          <HomeIcon />
          Today
        </NavLink>
        <NavLink href="/study" active={pathname.startsWith("/study")}>
          <ClockIcon />
          Study
        </NavLink>
        <NavLink href="/stats" active={pathname.startsWith("/stats")}>
          <ChartIcon />
          Stats
        </NavLink>
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <p className="px-2 py-1 text-caption uppercase tracking-[0.06em] text-ink-3">
          Languages
        </p>

        {languages.map((language) => {
          const href = `/l/${language.id}`;
          return (
            <Link
              key={language.id}
              href={href}
              data-accent={language.accentKey as AccentKey}
              className={cn(
                "flex items-center gap-2.5 rounded-sm px-2 py-2 text-label transition-colors duration-[120ms]",
                pathname.startsWith(href)
                  ? "bg-accent-soft text-ink"
                  : "text-ink-2 hover:bg-subtle hover:text-ink",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full bg-accent"
              />
              <span className="flex-1 truncate">{language.name}</span>
              {language.cefrLevel ? (
                <span className="text-caption text-ink-3">
                  {language.cefrLevel}
                </span>
              ) : null}
            </Link>
          );
        })}

        <Link
          href="/settings/languages"
          className="mt-1 flex items-center gap-2.5 rounded-sm px-2 py-2 text-label text-ink-3 transition-colors duration-[120ms] hover:bg-subtle hover:text-ink"
        >
          <PlusIcon className="size-4" />
          Add a language
        </Link>
      </div>

      <NavLink href="/settings" active={pathname.startsWith("/settings")}>
        <SettingsIcon />
        Settings
      </NavLink>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-sm px-2 py-2 text-label transition-colors duration-[120ms]",
        active
          ? "bg-subtle text-ink"
          : "text-ink-2 hover:bg-subtle hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
