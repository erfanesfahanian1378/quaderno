"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";
import { Banner, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export type DeckSummary = {
  id: string;
  name: string;
  description: string | null;
  cardCount: number;
};

/**
 * Decks of hand-made cards, and the form to add one.
 *
 * Two-sided by definition: a card is a front and a back, and both are
 * required — a card with only one side is not a card, it is a note, and there
 * is already a better place for those.
 *
 * The add form stays open after each card and puts focus back on the front
 * field. Adding vocabulary is something people do in runs of ten, and a form
 * that closes after one is a form that gets used once.
 */
export function Decks({
  languageId,
  decks,
}: {
  languageId: string;
  decks: DeckSummary[];
}) {
  const router = useRouter();
  const [openDeck, setOpenDeck] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const createDeck = handler(
    async () => {
      const trimmed = name.trim();
      if (!trimmed) return;

      setBusy(true);
      setError(null);

      const result = await api.post<{ id: string }>("/api/decks", {
        languageId,
        name: trimmed,
      });
      setBusy(false);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setName("");
      setCreating(false);
      setOpenDeck(result.data.id);
      router.refresh();
    },
    () => setBusy(false),
  );

  return (
    <section aria-labelledby="decks-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="decks-heading" className="text-h3 text-ink">
            Your own cards
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-2">
            Words worth remembering that did not come from a handout.
          </p>
        </div>

        {!creating ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCreating(true)}
          >
            New deck
          </Button>
        ) : null}
      </div>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {creating ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createDeck(event);
              if (event.key === "Escape") setCreating(false);
            }}
            placeholder="Deck name — Verbi irregolari"
            maxLength={80}
            className="h-9 min-w-0 flex-1 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink sm:max-w-[280px]"
          />
          <Button size="sm" loading={busy} onClick={createDeck}>
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {decks.length === 0 && !creating ? (
        <p className="text-body-sm text-ink-3">
          No decks yet. Vocabulary tables in your notes already become cards on
          their own — a deck is for everything else.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {decks.map((deck) => (
          <li
            key={deck.id}
            className="rounded-md border border-hairline bg-surface"
          >
            <button
              type="button"
              onClick={() =>
                setOpenDeck((current) => (current === deck.id ? null : deck.id))
              }
              aria-expanded={openDeck === deck.id}
              className="flex w-full items-center justify-between gap-2 p-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-label text-ink">
                  {deck.name}
                </span>
                <span className="block text-caption text-ink-3">
                  {deck.cardCount} card{deck.cardCount === 1 ? "" : "s"}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "text-ink-3 transition-transform duration-[120ms]",
                  openDeck === deck.id && "rotate-90",
                )}
              >
                ›
              </span>
            </button>

            {openDeck === deck.id ? (
              <div className="border-t border-hairline p-3">
                <AddCard deckId={deck.id} onAdded={() => router.refresh()} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddCard({ deckId, onAdded }: { deckId: string; onAdded: () => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  const submit = handler(
    async () => {
      if (!front.trim() || !back.trim()) return;

      setBusy(true);
      setError(null);

      const result = await api.post(`/api/decks/${deckId}/cards`, {
        front: front.trim(),
        back: back.trim(),
      });
      setBusy(false);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      // Cleared and refocused, ready for the next one.
      setFront("");
      setBack("");
      setAdded((count) => count + 1);
      document.getElementById(`front-${deckId}`)?.focus();
      onAdded();
    },
    () => setBusy(false),
  );

  return (
    <div className="flex flex-col gap-2">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-caption text-ink-3">Front — the word</span>
          <input
            id={`front-${deckId}`}
            value={front}
            onChange={(event) => setFront(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                document.getElementById(`back-${deckId}`)?.focus();
              }
            }}
            maxLength={2000}
            className="h-10 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-caption text-ink-3">Back — what it means</span>
          <input
            id={`back-${deckId}`}
            value={back}
            onChange={(event) => setBack(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit(event);
            }}
            maxLength={2000}
            className="h-10 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={!front.trim() || !back.trim()}
          onClick={submit}
        >
          Add card
        </Button>
        <span className="text-caption text-ink-3">
          {added > 0
            ? `${added} added — due today`
            : "Enter moves to the back, Enter again adds it"}
        </span>
      </div>
    </div>
  );
}
