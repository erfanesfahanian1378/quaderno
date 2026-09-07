"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  onlyBasicVoices,
  pickVoice,
  rankVoices,
  type VoiceLike,
} from "./speech-voices";

/**
 * Read-aloud, shared by the viewer's Say-it panel and the review card.
 *
 * The browser's own speech synthesis: no dependency, no API key, no
 * per-request cost, and it works on a phone in a classroom with bad wifi.
 *
 * Which voice it uses is the whole game, and is decided in speech-voices.ts —
 * see that file for why "the first voice matching this language" sounds fine
 * on a phone and awful on a Mac. The choice is remembered per language,
 * because a learner who has picked a voice has picked it.
 */

export type Speech = {
  speak: (text: string, rate?: number) => void;
  cancel: () => void;
  speaking: boolean;
  supported: boolean;
  /** The voice in use. */
  voice: SpeechSynthesisVoice | null;
  /** Every usable voice for this language, best first. */
  voices: SpeechSynthesisVoice[];
  /**
   * The list has not arrived yet. Not the same as an empty list, and the
   * difference matters: telling someone their device has no Italian voice
   * while it is still loading 180 of them is worse than saying nothing.
   */
  loading: boolean;
  /** Override the choice. Remembered. Pass null to go back to the default. */
  setVoice: (voice: SpeechSynthesisVoice | null) => void;
  /**
   * Nothing better than the operating system's oldest tier is installed.
   * On macOS the good voices are a free download almost nobody knows about,
   * and no amount of code substitutes for them.
   */
  basicOnly: boolean;
};

const STORAGE_PREFIX = "quaderno.voice.";

function remembered(languageCode: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + languageCode);
  } catch {
    // Private windows and blocked site data both throw here.
    return null;
  }
}

function remember(languageCode: string, name: string | null): void {
  try {
    if (name === null) localStorage.removeItem(STORAGE_PREFIX + languageCode);
    else localStorage.setItem(STORAGE_PREFIX + languageCode, name);
  } catch {
    // A preference we cannot store is not worth failing over.
  }
}

export function useSpeech(languageCode: string): Speech {
  const [all, setAll] = useState<SpeechSynthesisVoice[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  /** Voices have not arrived yet. Distinct from "there are none". */
  const [loading, setLoading] = useState(true);

  /**
   * Getting the voice list, which is harder than it should be.
   *
   * `getVoices()` returns an empty array on the first call while the platform
   * loads them, so `voiceschanged` has to be listened for — skipping that is
   * why "no voices available" is such a common bug report. But Chrome does
   * not reliably fire that event either: on a freshly loaded page it can stay
   * silent for seconds, or until something else touches the API. Listening
   * alone left the picker missing entirely on a Mac with 180 voices installed.
   *
   * So: listen AND poll, and stop as soon as either wins.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const read = () => {
      if (cancelled) return false;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return false;
      setAll(voices);
      setLoading(false);
      return true;
    };

    if (!read()) {
      let attempts = 0;
      const poll = () => {
        if (cancelled || read()) return;
        attempts += 1;
        // Ten tries over ~2.5s. Past that the platform genuinely has none —
        // some Linux builds ship without a speech engine at all.
        if (attempts >= 10) {
          setLoading(false);
          return;
        }
        timer = window.setTimeout(poll, 250);
      };
      timer = window.setTimeout(poll, 100);
    }

    window.speechSynthesis.addEventListener("voiceschanged", read);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", read);
    };
  }, []);

  useEffect(() => {
    setChosen(remembered(languageCode));
  }, [languageCode]);

  const voices = useMemo(
    () =>
      rankVoices(
        all as unknown as VoiceLike[],
        languageCode,
      ) as unknown as SpeechSynthesisVoice[],
    [all, languageCode],
  );

  const voice = useMemo(() => {
    if (chosen) {
      const match = voices.find((candidate) => candidate.name === chosen);
      // A remembered voice can vanish — a different machine, a deleted
      // download. Fall through to the default rather than going silent.
      if (match) return match;
    }
    return (
      (pickVoice(
        all as unknown as VoiceLike[],
        languageCode,
      ) as unknown as SpeechSynthesisVoice) ?? null
    );
  }, [all, chosen, languageCode, voices]);

  const setVoice = useCallback(
    (next: SpeechSynthesisVoice | null) => {
      setChosen(next?.name ?? null);
      remember(languageCode, next?.name ?? null);
    },
    [languageCode],
  );

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

  return {
    speak,
    cancel,
    speaking,
    supported,
    loading,
    voice,
    voices,
    setVoice,
    basicOnly: onlyBasicVoices(all as unknown as VoiceLike[], languageCode),
  };
}
