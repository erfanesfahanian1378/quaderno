"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  BookIcon,
  CardsIcon,
  ChartIcon,
  ClockIcon,
  HomeIcon,
  SettingsIcon,
} from "./icons";

/*
 * Review sits right after Library, because read-then-review is the order the
 * day happens in.
 *
 * It was missing entirely, and the sidebar that carries it only exists from
 * `lg` up — so on a phone the review queue, the Leitner boxes and every
 * hand-made card were unreachable. Not hard to find: there was no route to
 * them at all. "I don't see the flashcards" was a correct bug report about
 * navigation, not about the cards.
 */
const TABS = [
  { href: "/dashboard", label: "Today", Icon: HomeIcon },
  { href: "/library", label: "Library", Icon: BookIcon },
  { href: "/review", label: "Review", Icon: CardsIcon },
  { href: "/study", label: "Study", Icon: ClockIcon },
  { href: "/stats", label: "Stats", Icon: ChartIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
] as const;

/**
 * Bottom tab bar. Respects `env(safe-area-inset-bottom)` — the viewer's
 * floating toolbar sits above it and must never be behind it
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
                  // Six across a 360px phone is ~60px each, so the label is
                  // given its own smaller size and forbidden to wrap rather
                  // than being allowed to clip.
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] leading-tight whitespace-nowrap transition-colors duration-[120ms]",
                  active ? "text-accent" : "text-ink-3",
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
