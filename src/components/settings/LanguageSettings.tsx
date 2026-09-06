"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";
import { Banner, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ACCENT_KEYS, ACCENT_NAMES, type AccentKey } from "@/lib/tokens";

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export type SettingsLanguage = {
  id: string;
  name: string;
  code: string;
  accentKey: string;
  cefrLevel: string | null;
  archivedAt: Date | null;
};

export function LanguageSettings({
  languages,
  goals,
}: {
  languages: SettingsLanguage[];
  goals: { languageId: string; targetMinutes: number }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const goalFor = (languageId: string) =>
    goals.find((goal) => goal.languageId === languageId)?.targetMinutes ?? 0;

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    const result = await api.patch(`/api/languages/${id}`, body);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  async function setGoal(languageId: string, hours: number) {
    setBusyId(languageId);
    await api.put("/api/study/goals", {
      languageId,
      targetMinutes: Math.round(hours * 60),
    });
    setBusyId(null);
    router.refresh();
  }

  async function archive(id: string) {
    setBusyId(id);
    await api.delete(`/api/languages/${id}`);
    setBusyId(null);
    router.refresh();
  }

  if (languages.length === 0) {
    return (
      <Banner tone="info">No languages yet. Add one from the sidebar.</Banner>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {languages.map((language) => (
        <Card
          key={language.id}
          data-accent={language.accentKey as AccentKey}
          className={cn(
            "flex flex-col gap-4 p-4",
            language.archivedAt && "opacity-60",
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              defaultValue={language.name}
              onBlur={(event) => {
                if (event.target.value !== language.name) {
                  void patch(language.id, { name: event.target.value });
                }
              }}
              aria-label={`Name for ${language.name}`}
              className="h-10 flex-1 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
            />
            {language.archivedAt ? (
              <span className="rounded-sm bg-subtle px-2 py-1 text-caption text-ink-2">
                archived
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handler(async () => archive(language.id))}
                disabled={busyId === language.id}
              >
                Archive
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-caption text-ink-2">Colour</span>
            {ACCENT_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={handler(async () =>
                  patch(language.id, { accentKey: key }),
                )}
                aria-label={ACCENT_NAMES[key]}
                title={ACCENT_NAMES[key]}
                aria-pressed={language.accentKey === key}
                className={cn(
                  "size-7 rounded-full transition-transform duration-[120ms]",
                  language.accentKey === key &&
                    "ring-2 ring-ink ring-offset-2 ring-offset-[var(--bg-surface)]",
                )}
                style={{ background: `var(--${key}-base)` }}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-caption text-ink-2">Level</span>
            {CEFR.map((level) => (
              <button
                key={level}
                type="button"
                onClick={handler(async () =>
                  patch(language.id, {
                    cefrLevel: language.cefrLevel === level ? null : level,
                  }),
                )}
                aria-pressed={language.cefrLevel === level}
                className={cn(
                  "h-8 rounded-sm px-2.5 text-caption transition-colors duration-[120ms]",
                  language.cefrLevel === level
                    ? "bg-ink text-ink-inverse"
                    : "bg-subtle text-ink-2 hover:text-ink",
                )}
              >
                {level}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-caption text-ink-2">Weekly</span>
            {[1, 2, 3, 5, 8, 12].map((hours) => (
              <button
                key={hours}
                type="button"
                onClick={handler(async () => setGoal(language.id, hours))}
                aria-pressed={goalFor(language.id) === hours * 60}
                className={cn(
                  "h-8 rounded-sm px-2.5 text-caption tabular transition-colors duration-[120ms]",
                  goalFor(language.id) === hours * 60
                    ? "bg-accent text-accent-on"
                    : "bg-subtle text-ink-2 hover:text-ink",
                )}
              >
                {hours}h
              </button>
            ))}
            {/*
              Raising a goal writes a new effectiveFrom row rather than
              overwriting, so past weeks are still reported against the target
              that was actually in force.
            */}
          </div>
        </Card>
      ))}
    </div>
  );
}
