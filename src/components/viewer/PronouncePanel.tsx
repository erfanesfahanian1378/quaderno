"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useSpeech } from "@/lib/speech";
import { useTranslation } from "@/lib/translate";
import { VoicePicker } from "@/components/speech/VoicePicker";

/**
 * Read-aloud and what it means, in one panel.
 *
 * Uses the browser's own speech synthesis: no dependency, no API key, no
 * per-request cost, and it works on a phone in a classroom with bad wifi. The
 * voices are the ones the device already has, which on a phone are usually
 * good and always free.
 *
 * It picks a voice matching the language you are studying rather than the
 * device default, because a French word read by an English voice is worse
 * than useless for accent practice — it teaches the wrong thing.
 *
 * The MEANING sits in the same panel rather than in one of its own, because
 * the two questions arrive together: nobody wonders how to say a word they
 * already understand, or what a word means without also wanting to say it.
 * Translation goes through the server, which caches every answer — see
 * src/server/services/translate.
 */

const RATES = [
  { value: 0.55, label: "Slow" },
  { value: 0.8, label: "Normal" },
  { value: 1, label: "Fast" },
] as const;

export function PronouncePanel({
  languageCode,
  open,
  initialText,
  onClose,
}: {
  /** ISO 639-1, e.g. "it" or "fr". */
  languageCode: string;
  open: boolean;
  initialText: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [rate, setRate] = useState(0.8);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only while the panel is open: a closed panel that keeps translating is
  // spending a shared rate limit on a question nobody asked.
  const meaning = useTranslation(text, languageCode, open);

  // Voice picking, the utterance lifecycle and the cancel-before-speak rule
  // all live in the hook — the review card needs exactly the same behaviour.
  const speech = useSpeech(languageCode);
  const { speak, cancel, speaking, supported } = speech;

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  useEffect(() => {
    if (!open) cancel();
  }, [open, cancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-2 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[420px] rounded-lg border border-hairline bg-surface p-3 shadow-e3 lg:bottom-28">
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-ink">Say it</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-sm text-ink-3 hover:bg-subtle hover:text-ink"
        >
          ×
        </button>
      </div>

      {!supported ? (
        <p className="mt-2 text-body-sm text-ink-2">
          This browser cannot read text aloud.
        </p>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <input
              ref={inputRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") speak(text, rate);
              }}
              placeholder="A word or a phrase"
              aria-label="Text to read aloud"
              className="h-11 flex-1 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
            />
            <button
              type="button"
              onClick={() => speak(text, rate)}
              disabled={!text.trim()}
              aria-label="Read it aloud"
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-sm transition-colors duration-[120ms]",
                speaking
                  ? "bg-accent-soft text-accent"
                  : "bg-accent text-accent-on",
                "disabled:opacity-40",
              )}
            >
              <SpeakerIcon speaking={speaking} />
            </button>
          </div>

          {/*
            Reserved height, so the panel does not jump when an answer lands.
            It sits over a document someone is reading; a control that moves
            under the thumb is worse than one that waits.
          */}
          <div className="mt-2 min-h-[22px]">
            {meaning.status === "loading" ? (
              <p className="text-body-sm text-ink-3">Looking it up…</p>
            ) : meaning.status === "done" ? (
              <p className="text-body-sm text-ink">
                <span className="text-ink-3">means </span>
                {meaning.text}
              </p>
            ) : meaning.status === "error" ? (
              <p className="text-caption text-ink-3">{meaning.message}</p>
            ) : null}
          </div>

          <div className="mt-2 flex items-center gap-1">
            {RATES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setRate(option.value);
                  speak(text, option.value);
                }}
                aria-pressed={rate === option.value}
                className={cn(
                  "h-8 rounded-sm px-2.5 text-caption transition-colors duration-[120ms]",
                  rate === option.value
                    ? "bg-subtle text-ink"
                    : "text-ink-2 hover:bg-subtle",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/*
            The picker, not a read-only label. A Mac offers a dozen voices per
            language of wildly different quality and the API gives no way to
            tell two good ones apart, so the last word belongs to the ear
            listening.
          */}
          <VoicePicker
            speech={speech}
            languageCode={languageCode}
            className="mt-2"
          />
        </>
      )}
    </div>
  );
}

function SpeakerIcon({ speaking }: { speaking: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5"
    >
      <path d="M11 5 6.5 9H3.5v6h3L11 19z" />
      {speaking ? (
        <>
          <path d="M14.5 9.5a3.5 3.5 0 0 1 0 5" />
          <path d="M17 7a7 7 0 0 1 0 10" />
        </>
      ) : (
        <path d="M14.5 9.5a3.5 3.5 0 0 1 0 5" />
      )}
    </svg>
  );
}
