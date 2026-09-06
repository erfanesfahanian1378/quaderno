"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  BookIcon,
  ChartIcon,
  ClockIcon,
  HomeIcon,
  SettingsIcon,
} from "./icons";

const TABS = [
  { href: "/dashboard", label: "Today", Icon: HomeIcon },
  { href: "/library", label: "Library", Icon: BookIcon },
  { href: "/study", label: "Study", Icon: ClockIcon },
  { href: "/stats", label: "Stats", Icon: ChartIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;

/**
 * Five-item bottom tab bar. Respects `env(safe-area-inset-bottom)` — the
 * viewer's floating toolbar sits above it and must never be behind it
 * (DESIGN_BRIEF §4).
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 44px minimum touch target.
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 text-caption transition-colors duration-[120ms]",
                  active ? "text-accent" : "text-ink-3",
                )}
              >
                <Icon className="size-6" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
