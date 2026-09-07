"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Read-aloud, shared by the viewer's Say-it panel and the review card.
 *
 * The browser's own speech synthesis: no dependency, no API key, no
 * per-request cost, and it works on a phone in a classroom with bad wifi.
 *
 * Extracted from PronouncePanel when the review card needed the same thing.
 * The voice-picking below is the part worth not writing twice — it is three
 * lines of logic wrapped in one non-obvious lifecycle rule.
 */

export type Speech = {
  speak: (text: string, rate?: number) => void;
  cancel: () => void;
  speaking: boolean;
  supported: boolean;
  /** The chosen voice, so a caller can say which one it is using. */
  voice: SpeechSynthesisVoice | null;
};

export function useSpeech(languageCode: string): Speech {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);

  /**
   * Voices load asynchronously and the first call usually returns an empty
   * list, so `voiceschanged` has to be listened for. Skipping that is why
   * "no voices available" is such a common bug report.
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

      // A local voice works offline and has no network latency, which matters
      // when drilling a word means tapping the same button ten times.
      setVoice(
        exact.find((candidate) => candidate.localService) ?? exact[0] ?? null,
      );
    };

    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, [languageCode]);

  const speak = useCallback(
    (text: string, rate = 0.8) => {
      const trimmed = text.trim();
      if (!trimmed || typeof window === "undefined") return;
      if (!("speechSynthesis" in window)) return;

      // Cancel first: queued utterances stack up when you tap repeatedly.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(trimmed);
      /*
       * The language of the WORD, not of the interface. A French word read by
       * an English voice is worse than useless for accent practice — it
       * teaches the wrong thing.
       */
      utterance.lang = voice?.lang ?? languageCode;
      if (voice) utterance.voice = voice;
      utterance.rate = rate;

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [languageCode, voice],
  );

  const cancel = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  // Speech outlives the component that started it: navigating away mid-word
  // otherwise leaves the phone talking to itself.
  useEffect(() => cancel, [cancel]);

  return { speak, cancel, speaking, supported, voice };
}
