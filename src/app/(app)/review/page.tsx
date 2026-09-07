import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as review from "@/server/repositories/review";
import * as users from "@/server/repositories/user";
import { previewIntervals } from "@/server/services/review/sm2";
import { dayKeyInZone } from "@/lib/time";
import { Session } from "@/components/review/Session";
import Link from "next/link";
import { cn } from "@/lib/cn";

export const metadata = { title: "Review" };
export const dynamic = "force-dynamic";

/**
 * The review screen.
 *
 * The first card is rendered on the server, so opening this on a phone shows
 * a word rather than a spinner. Everything after it is graded through the API
 * without a navigation.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ language?: string }>;
}) {
  const ctx = await requireUserPage("/review");
  const params = await searchParams;

  const [user, list] = await Promise.all([
    users.findById(ctx),
    languages.list(ctx),
  ]);

  const todayKey = dayKeyInZone(new Date(), user?.timeZone ?? "Europe/Rome");

  const languageId = params.language;
  const language = languageId
    ? list.find((entry) => entry.id === languageId)
    : undefined;

  const [cards, total, byLanguage] = await Promise.all([
    review.due(ctx, todayKey, {
      ...(languageId ? { languageId } : {}),
      limit: 60,
    }),
    review.dueCount(ctx, todayKey, languageId),
    review.dueByLanguage(ctx, todayKey),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-reading text-display text-ink">Review</h1>
        <p className="mt-1 text-body-sm text-ink-2">
          {total === 0
            ? "Nothing due right now."
            : `${total} ${total === 1 ? "card" : "cards"} due${language ? ` in ${language.name}` : ""}.`}
        </p>
      </header>

      {list.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Filter by language">
          <FilterLink href="/review" selected={!languageId}>
            All
          </FilterLink>
          {list.map((entry) => (
            <FilterLink
              key={entry.id}
              href={`/review?language=${entry.id}`}
              selected={languageId === entry.id}
            >
              {entry.name}
              {byLanguage[entry.id] ? ` · ${byLanguage[entry.id]}` : ""}
            </FilterLink>
          ))}
        </nav>
      ) : null}

      <Session
        initial={cards.map((card) => ({
          id: card.id,
          front: card.front,
          back: card.back,
          example: card.example,
          note: card.note,
          lapses: card.lapses,
          reps: card.reps,
          intervals: previewIntervals(card, todayKey),
        }))}
        total={total}
        languageCode={language?.code ?? list[0]?.code ?? "en"}
        {...(languageId ? { languageId } : {})}
      />
    </div>
  );
}

function FilterLink({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-label transition-colors duration-[120ms]",
        selected
          ? "border-transparent bg-accent/15 text-accent"
          : "border-hairline text-ink-2 hover:bg-subtle hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
