import { requireUserPage } from "@/server/auth/guards";
import * as languages from "@/server/repositories/language";
import * as review from "@/server/repositories/review";
import * as users from "@/server/repositories/user";
import { previewIntervals } from "@/server/services/review/sm2";
import { dayKeyInZone } from "@/lib/time";
import { Session } from "@/components/review/Session";
import { BoxShelf } from "@/components/review/BoxShelf";
import { Decks } from "@/components/review/Decks";
import * as decks from "@/server/repositories/deck";
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

  const [cards, total, byLanguage, shelf, deckList] = await Promise.all([
    review.due(ctx, todayKey, {
      ...(languageId ? { languageId } : {}),
      limit: 60,
    }),
    review.dueCount(ctx, todayKey, languageId),
    review.dueByLanguage(ctx, todayKey),
    review.forBoxes(ctx, languageId),
    /*
     * `languageId` straight through, undefined included.
     *
     * This used to fall back to `list[0]?.id`, so "All" quietly showed only
     * the first language's decks — and a deck created from there went into
     * that language whatever the person was actually studying. With two
     * languages on the go that is not a filter, it is a wrong answer.
     */
    decks.list(ctx, languageId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-reading text-display text-ink">Review</h1>
          <p className="mt-1 text-body-sm text-ink-2">
            {total === 0
              ? "Nothing due right now."
              : `${total} ${total === 1 ? "card" : "cards"} due${language ? ` in ${language.name}` : ""}.`}
          </p>
        </div>

        {/*
          A way down to the decks.

          They belong below the session — reviewing is the daily thing and
          making cards is not — but on a phone that puts them a screen and a
          half past the fold, behind a card, a voice picker and five boxes.
          Reachable and second is right; second and invisible is not.
        */}
        <a
          href="#decks-heading"
          className="rounded-sm px-2 py-1 text-label text-ink-2 underline decoration-hairline-strong underline-offset-4 hover:text-ink"
        >
          Your own cards ↓
        </a>
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

      {/*
        The shelf sits above the session: seeing where the cards are is what
        makes someone start one, and it is the first thing worth looking at
        when nothing is due.
      */}
      <BoxShelf cards={shelf} todayKey={todayKey} />

      {/*
        Keyed by language, so switching remounts it.

        `Session` seeds its queue with `useState(initial)`, which reads its
        argument once and never again. Switching from Italiano to Français is
        a client-side navigation: the props change, the state does not, and
        the page then says "Nothing due right now" directly above an Italian
        card and "4 left". A key is what tells React these are different
        sessions rather than the same one with new props.
      */}
      <Session
        key={languageId ?? "all"}
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

      <Decks
        languages={list.map((entry) => ({ id: entry.id, name: entry.name }))}
        selectedLanguageId={languageId ?? null}
        decks={deckList.map((deck) => ({
          id: deck.id,
          name: deck.name,
          description: deck.description,
          cardCount: deck.cardCount,
          languageId: deck.languageId,
        }))}
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
