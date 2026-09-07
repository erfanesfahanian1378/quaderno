"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Speech } from "@/lib/speech";

/**
 * Choosing the voice, and saying how to get a better one.
 *
 * The second half matters more than the first. On macOS every voice installed
 * by default is the oldest, most robotic tier; the good ones — Siri and the
 * "Enhanced" downloads — are free and hidden four levels deep in System
 * Settings. Someone practising their accent against a 2005 speech synthesiser
 * has no way of knowing that, and will reasonably conclude the app is bad.
 */
export function VoicePicker({
  speech,
  languageCode,
  className,
}: {
  speech: Speech;
  languageCode: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!speech.supported) return null;

  // Say nothing while the platform is still handing them over. A brief blank
  // is better than a claim that turns out to be false a second later.
  if (speech.loading) return null;

  if (speech.voices.length === 0) {
    return (
      <p className={cn("text-caption text-ink-3", className)}>
        Your device has no {languageCode.toUpperCase()} voice installed, so this
        will use the default one — the wrong accent to practise against.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-caption text-ink-3" htmlFor="voice-picker">
          Voice
        </label>

        <select
          id="voice-picker"
          value={speech.voice?.name ?? ""}
          onChange={(event) => {
            const next =
              speech.voices.find(
                (candidate) => candidate.name === event.target.value,
              ) ?? null;
            speech.setVoice(next);
            // Say something immediately, so the choice is audible rather than
            // theoretical.
            if (next) speech.speak(sample(languageCode));
          }}
          className="h-8 max-w-[220px] rounded-sm border border-hairline bg-surface px-2 text-caption text-ink"
        >
          {speech.voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name} · {voice.lang}
            </option>
          ))}
        </select>
      </div>

      {speech.basicOnly ? (
        <div className="text-caption text-ink-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="underline underline-offset-2 hover:text-ink"
          >
            Sounds robotic?
          </button>

          {open ? (
            <div className="mt-1.5 rounded-sm bg-subtle p-2 leading-relaxed">
              <p className="text-ink-2">
                Only the basic voices are installed. The good ones are a free
                download and make a large difference.
              </p>
              <p className="mt-1.5 text-ink-2">
                <strong className="text-ink">macOS:</strong> System Settings →
                Accessibility → Spoken Content → System Voice →{" "}
                <em>Manage Voices</em>. Pick your language, download one marked{" "}
                <em>Enhanced</em> or <em>Premium</em>, then reload this page.
              </p>
              <p className="mt-1.5 text-ink-2">
                <strong className="text-ink">Windows:</strong> Settings → Time
                &amp; language → Language &amp; region → add the language with{" "}
                <em>Speech</em> included.
              </p>
              <p className="mt-1.5 text-ink-3">
                Chrome also offers online Google voices, which are usually
                better than the built-in ones.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A short phrase in the language, so the sample is worth hearing. */
function sample(languageCode: string): string {
  const base = languageCode.split(/[-_]/)[0]?.toLowerCase() ?? "";
  return SAMPLES[base] ?? "Hello";
}

const SAMPLES: Record<string, string> = {
  it: "Buongiorno, come stai?",
  fr: "Bonjour, comment ça va ?",
  es: "Buenos días, ¿cómo estás?",
  de: "Guten Tag, wie geht es dir?",
  pt: "Bom dia, como está?",
  nl: "Goedendag, hoe gaat het?",
  ru: "Здравствуйте, как дела?",
  ja: "こんにちは、お元気ですか。",
  ko: "안녕하세요, 잘 지내세요?",
  zh: "你好，你好吗？",
  ar: "مرحبا، كيف حالك؟",
  tr: "Merhaba, nasılsın?",
  pl: "Dzień dobry, jak się masz?",
  sv: "God dag, hur mår du?",
  el: "Καλημέρα, τι κάνεις;",
  he: "שלום, מה שלומך?",
  fa: "سلام، حال شما چطور است؟",
  en: "Good morning, how are you?",
};
