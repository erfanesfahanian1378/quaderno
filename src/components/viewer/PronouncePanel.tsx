"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Read-aloud, for practising pronunciation.
 *
 * Uses the browser's own speech synthesis: no dependency, no API key, no
 * per-request cost, and it works on a phone in a classroom with bad wifi. The
 * voices are the ones the device already has, which on a phone are usually
 * good and always free.
 *
 * It picks a voice matching the language you are studying rather than the
 * device default, because a French word read by an English voice is worse
 * than useless for accent practice — it teaches the wrong thing.
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
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [supported, setSupported] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  /**
   * Voices load asynchronously and the first call often returns an empty
   * list, so the `voiceschanged` event has to be listened for. Skipping this
   * is why "no voices available" is such a common bug report.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }

    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      const exact = voices.filter((candidate) =>
        candidate.lang.toLowerCase().startsWith(languageCode.toLowerCase()),
      );

      // Prefer a local voice: it works offline and has no network latency,
      // which matters when you are tapping a word repeatedly to drill it.
      const best =
        exact.find((candidate) => candidate.localService) ?? exact[0] ?? null;

      setVoice(best);
    };

    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, [languageCode]);

  const speak = useCallback(
    (value: string, atRate: number) => {
      const trimmed = value.trim();
      if (!trimmed || !("speechSynthesis" in window)) return;

      // Cancel first: queued utterances stack up if you tap repeatedly, and
      // drilling a word means tapping repeatedly.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = voice?.lang ?? languageCode;
      if (voice) utterance.voice = voice;
      utterance.rate = atRate;

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [languageCode, voice],
  );

  useEffect(() => {
    if (!open) window.speechSynthesis?.cancel();
  }, [open]);

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

            <span className="ml-auto truncate text-caption text-ink-3">
              {voice
                ? voice.name.slice(0, 22)
                : `no ${languageCode.toUpperCase()} voice installed`}
            </span>
          </div>

          {!voice ? (
            <p className="mt-2 text-caption text-ink-3">
              Your device has no {languageCode.toUpperCase()} voice, so this
              will use the default one — which is the wrong accent to practise
              against. Add one in your system&apos;s language settings.
            </p>
          ) : null}
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
