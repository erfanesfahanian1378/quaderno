"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";
import { Banner, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AccentKey } from "@/lib/tokens";
import type { ActiveTimer } from "./TimerPill";

const ACTIVITIES = [
  "CLASS",
  "HOMEWORK",
  "READING",
  "REVIEW",
  "LISTENING",
  "SPEAKING",
  "WRITING",
  "OTHER",
] as const;

/** Duration quick-chips, per DESIGN_BRIEF §5.9. */
const QUICK_MINUTES = [15, 30, 45, 60, 90] as const;

export function StudyControls({
  languages,
  activeTimer,
}: {
  languages: { id: string; name: string; accentKey: string }[];
  activeTimer: ActiveTimer | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [languageId, setLanguageId] = useState(languages[0]?.id ?? "");
  const [activity, setActivity] =
    useState<(typeof ACTIVITIES)[number]>("READING");
  const [minutes, setMinutes] = useState(30);
  const [showLog, setShowLog] = useState(false);

  async function startTimer() {
    setBusy(true);
    setError(null);

    const result = await api.post("/api/study/timer/start", {
      languageId,
      activity,
    });

    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    setBusy(false);
    router.refresh();
  }

  async function logManual() {
    setBusy(true);
    setError(null);

    const result = await api.post("/api/study/sessions", {
      languageId,
      activity,
      startedAt: new Date(Date.now() - minutes * 60_000).toISOString(),
      durationSec: minutes * 60,
    });

    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    setBusy(false);
    setShowLog(false);
    router.refresh();
  }

  if (languages.length === 0) {
    return (
      <Banner tone="info">
        Add a language first — study time is tracked per language.
      </Banner>
    );
  }

  return (
    <Card className="flex flex-col gap-5 p-5">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div className="flex flex-col gap-2">
        <p className="text-label text-ink-2">Language</p>
        <div className="flex flex-wrap gap-2">
          {languages.map((language) => (
            <button
              key={language.id}
              type="button"
              data-accent={language.accentKey as AccentKey}
              onClick={() => setLanguageId(language.id)}
              aria-pressed={languageId === language.id}
              className={cn(
                "flex h-10 items-center gap-2 rounded-sm px-3 text-label transition-colors duration-[120ms]",
                languageId === language.id
                  ? "bg-accent-soft text-ink"
                  : "bg-subtle text-ink-2 hover:text-ink",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-accent"
              />
              {language.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-label text-ink-2">Activity</p>
        <div className="flex flex-wrap gap-2">
          {ACTIVITIES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setActivity(option)}
              aria-pressed={activity === option}
              className={cn(
                "h-9 rounded-full px-3 text-caption capitalize transition-colors duration-[120ms]",
                activity === option
                  ? "bg-ink text-ink-inverse"
                  : "bg-subtle text-ink-2 hover:text-ink",
              )}
            >
              {option.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {showLog ? (
        <div className="flex flex-col gap-2">
          <p className="text-label text-ink-2">How long?</p>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_MINUTES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMinutes(value)}
                aria-pressed={minutes === value}
                className={cn(
                  "h-10 rounded-sm px-3 text-label tabular transition-colors duration-[120ms]",
                  minutes === value
                    ? "bg-accent text-accent-on"
                    : "bg-subtle text-ink-2 hover:text-ink",
                )}
              >
                {value}m
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              aria-label="Minutes"
              className="h-10 w-20 rounded-sm border border-hairline-strong bg-surface px-2 text-body tabular text-ink"
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {showLog ? (
          <>
            <Button
              size="lg"
              onClick={handler(logManual, () => setBusy(false))}
              loading={busy}
            >
              Log {minutes} minutes
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setShowLog(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              onClick={handler(startTimer, () => setBusy(false))}
              loading={busy}
              disabled={activeTimer !== null}
            >
              {activeTimer ? "A timer is running" : "Start a timer"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setShowLog(true)}
            >
              Log time instead
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
