"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { handler } from "@/lib/api-client";

/**
 * Three steps, skippable at every one, progress as three dots
 * (DESIGN_BRIEF §5.2).
 *
 * Step 1 is the moment the app becomes *theirs* — picking a language assigns
 * an accent and the swatch visibly changes.
 */

const COMMON_LANGUAGES = [
  { code: "it", name: "Italiano", letters: "It" },
  { code: "fr", name: "Français", letters: "Fr" },
  { code: "es", name: "Español", letters: "Es" },
  { code: "de", name: "Deutsch", letters: "De" },
  { code: "pt", name: "Português", letters: "Pt" },
  { code: "nl", name: "Nederlands", letters: "Nl" },
  { code: "ja", name: "日本語", letters: "Ja" },
  { code: "ar", name: "العربية", letters: "Ar" },
] as const;

const ACCENTS = [
  "accent-1",
  "accent-2",
  "accent-3",
  "accent-4",
  "accent-5",
  "accent-6",
] as const;

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [picked, setPicked] = useState<{ code: string; name: string } | null>(
    null,
  );
  const [customName, setCustomName] = useState("");
  const [goalHours, setGoalHours] = useState(3);
  const [languageId, setLanguageId] = useState<string | null>(null);

  // Preview the accent the language will get, so the swatch changes as they
  // pick — the whole point of this step.
  const previewAccent = ACCENTS[0]!;

  async function createLanguage() {
    const code = picked?.code ?? customName.slice(0, 2).toLowerCase();
    const name = picked?.name ?? customName.trim();
    if (!name) {
      setError("Pick a language, or type its name.");
      return;
    }

    setSaving(true);
    setError(null);

    const response = await fetch("/api/languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "Could not add that language.");
      setSaving(false);
      return;
    }

    const created = (await response.json()) as { id: string };
    setLanguageId(created.id);
    setSaving(false);
    setStep(1);
  }

  async function saveGoal() {
    if (!languageId) return;
    setSaving(true);
    await fetch("/api/study/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ languageId, targetMinutes: goalHours * 60 }),
    });
    setSaving(false);
    setStep(2);
  }

  function finish() {
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-8 py-6">
      <Dots step={step} />

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {step === 0 ? (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="text-h1 text-ink">Add your first language</h1>
            <p className="mt-2 text-body text-ink-2">
              You can add more later. Each one gets its own colour.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COMMON_LANGUAGES.map((language) => {
              const active = picked?.code === language.code;
              return (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => {
                    setPicked({ code: language.code, name: language.name });
                    setCustomName("");
                  }}
                  data-accent={previewAccent}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-md border px-3 py-4 transition-colors duration-[120ms]",
                    active
                      ? "border-accent bg-accent-soft"
                      : "border-hairline bg-surface hover:bg-subtle",
                  )}
                >
                  {/* Flags as letterforms, not emoji flags — DESIGN_BRIEF §5.2. */}
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-full font-reading text-h3",
                      active
                        ? "bg-accent text-accent-on"
                        : "bg-subtle text-ink-2",
                    )}
                  >
                    {language.letters}
                  </span>
                  <span className="text-label text-ink">{language.name}</span>
                </button>
              );
            })}
          </div>

          <Input
            label="Something else"
            placeholder="e.g. Svenska"
            value={customName}
            onChange={(event) => {
              setCustomName(event.target.value);
              setPicked(null);
            }}
          />

          <Button
            size="lg"
            onClick={handler(createLanguage, () => {
              setError("Could not reach the server. Check your connection.");
              setSaving(false);
            })}
            loading={saving}
          >
            Continue
          </Button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="text-h1 text-ink">Set a weekly goal</h1>
            <p className="mt-2 text-body text-ink-2">
              Something you will actually hit. You can change it whenever.
            </p>
          </div>

          <div className="rounded-md border border-hairline bg-surface p-5">
            <output className="block text-display text-ink">
              {goalHours}h<span className="text-h3 text-ink-2"> a week</span>
            </output>
            <p className="mt-1 text-body-sm text-ink-2">
              That is about {Math.round((goalHours * 60) / 7)} minutes a day.
            </p>

            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={goalHours}
              onChange={(event) => setGoalHours(Number(event.target.value))}
              aria-label="Hours per week"
              className="mt-5 w-full accent-[var(--accent-base)]"
            />
            <div className="mt-1 flex justify-between text-caption text-ink-3">
              <span>1h</span>
              <span>20h</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              size="lg"
              onClick={handler(saveGoal, () => setSaving(false))}
              loading={saving}
            >
              Continue
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setStep(2)}>
              Skip
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="text-h1 text-ink">You are set up</h1>
            <p className="mt-2 text-body text-ink-2">
              Add your class times whenever you like — we will ask if you
              attended, so your hours log themselves.
            </p>
          </div>

          <div className="flex gap-3">
            <Button size="lg" onClick={finish}>
              Go to my dashboard
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Dots({ step }: { step: number }) {
  return (
    <div className="flex gap-2" aria-label={`Step ${step + 1} of 3`}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 rounded-full transition-all duration-[180ms]",
            index === step ? "w-6 bg-accent" : "w-1.5 bg-inset",
          )}
        />
      ))}
    </div>
  );
}
