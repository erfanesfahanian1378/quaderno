"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, handler } from "@/lib/api-client";
import { Banner, Button, Card, EmptyState } from "@/components/ui";
import { JoinButton } from "./JoinButton";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/time";
import type { AccentKey } from "@/lib/tokens";
import type { Occurrence } from "@/server/services/study/schedule";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Rule = {
  id: string;
  languageId: string;
  title: string;
  startTime: string;
  durationMin: number;
  location: string | null;
  meetingUrl: string | null;
  timeZone: string;
  active: boolean;
  rrule: string;
};

export function ScheduleView({
  languages,
  rules,
  occurrences,
}: {
  languages: { id: string; name: string; accentKey: string }[];
  rules: Rule[];
  occurrences: Occurrence[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const needsAnswer = occurrences.filter((entry) => entry.needsConfirmation);
  const ahead = occurrences.filter(
    (entry) =>
      !entry.needsConfirmation && new Date(entry.startsAt) >= new Date(),
  );

  const languageOf = (id: string) => languages.find((l) => l.id === id);

  const answer = async (entry: Occurrence, attended: boolean) => {
    await api.post(
      `/api/schedule/${entry.scheduledClassId}/occurrences/${entry.date}/confirm`,
      { attended },
    );
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-reading text-display text-ink">Schedule</h1>
          <p className="mt-1 text-body-sm text-ink-2">
            Add your class times once, and confirming you went logs the hours
            for you.
          </p>
        </div>
        <Button onClick={() => setAdding((value) => !value)}>
          {adding ? "Cancel" : "Add a class time"}
        </Button>
      </header>

      {adding ? (
        <RecurringClassEditor
          languages={languages}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}

      {/*
        The prompt comes first, because an unanswered class is the only thing
        on this screen that needs the user to do something.
      */}
      {needsAnswer.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-ink">Did you go?</h2>
          <div className="flex flex-col gap-2">
            {needsAnswer.map((entry) => {
              const language = languageOf(entry.languageId);
              return (
                <Card
                  key={`${entry.scheduledClassId}-${entry.date}`}
                  data-accent={language?.accentKey}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div
                    data-accent={
                      (language?.accentKey ?? "accent-1") as AccentKey
                    }
                  >
                    <p className="flex items-center gap-2 text-body text-ink">
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full bg-accent"
                      />
                      {entry.title}
                    </p>
                    <p className="mt-0.5 text-body-sm text-ink-2">
                      {formatDay(entry.date)} ·{" "}
                      {new Date(entry.startsAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {formatDuration(entry.durationMin * 60)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <JoinButton url={entry.meetingUrl} size="sm" />
                    <Button
                      size="sm"
                      onClick={handler(async () => answer(entry, true))}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handler(async () => answer(entry, false))}
                    >
                      No
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">Coming up</h2>

        {ahead.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            description="Add the days and times your class runs. We will ask whether you went, and log the hours when you say yes."
          />
        ) : (
          <Card className="divide-y divide-hairline">
            {ahead.map((entry) => {
              const language = languageOf(entry.languageId);
              return (
                <div
                  key={`${entry.scheduledClassId}-${entry.date}`}
                  data-accent={(language?.accentKey ?? "accent-1") as AccentKey}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-h3 tabular text-ink">
                      {entry.date.slice(8, 10)}
                    </p>
                    <p className="text-caption text-ink-3">
                      {
                        WEEKDAYS[
                          (new Date(`${entry.date}T12:00:00Z`).getUTCDay() +
                            6) %
                            7
                        ]
                      }
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-body text-ink">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full bg-accent"
                      />
                      {entry.title}
                    </p>
                    <p className="text-caption text-ink-3">
                      {new Date(entry.startsAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {entry.location ? ` · ${entry.location}` : ""}
                      {entry.classSessionId
                        ? entry.attended
                          ? " · attended"
                          : " · missed"
                        : ""}
                    </p>
                  </div>

                  <JoinButton url={entry.meetingUrl} size="sm" />
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {rules.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-ink">Your class times</h2>
          <Card className="divide-y divide-hairline">
            {rules.map((rule) => {
              const language = languageOf(rule.languageId);
              return (
                <div
                  key={rule.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-3",
                    !rule.active && "opacity-50",
                  )}
                >
                  <div>
                    <p className="text-body text-ink">{rule.title}</p>
                    <p className="text-caption text-ink-3">
                      {language?.name} · {describeRule(rule)} · {rule.startTime}{" "}
                      · {formatDuration(rule.durationMin * 60)} ·{" "}
                      {rule.timeZone}
                    </p>
                  </div>
                  {rule.active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handler(async () => {
                        await api.delete(`/api/scheduled-classes/${rule.id}`);
                        router.refresh();
                      })}
                    >
                      Stop
                    </Button>
                  ) : (
                    <span className="text-caption text-ink-3">stopped</span>
                  )}
                </div>
              );
            })}
          </Card>
          <p className="text-caption text-ink-3">
            Stopping a class time keeps every hour you already logged against
            it.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function RecurringClassEditor({
  languages,
  onDone,
}: {
  languages: { id: string; name: string; accentKey: string }[];
  onDone: () => void;
}) {
  const [languageId, setLanguageId] = useState(languages[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState("18:30");
  const [durationMin, setDurationMin] = useState(90);
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);

    const result = await api.post("/api/scheduled-classes", {
      languageId,
      title: title.trim() || "Class",
      weekdays,
      startTime,
      durationMin,
      location: location.trim() || undefined,
      // Empty means "no link", not "a link that is the empty string" — the
      // schema turns "" into null rather than rejecting it.
      meetingUrl: meetingUrl.trim() || null,
      startsOn: new Date().toISOString().slice(0, 10),
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onDone();
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div className="flex flex-wrap gap-2">
        {languages.map((language) => (
          <button
            key={language.id}
            type="button"
            data-accent={language.accentKey as AccentKey}
            onClick={() => setLanguageId(language.id)}
            aria-pressed={languageId === language.id}
            className={cn(
              "flex h-10 items-center gap-2 rounded-sm px-3 text-label",
              languageId === language.id
                ? "bg-accent-soft text-ink"
                : "bg-subtle text-ink-2",
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

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What is it called? e.g. B1 evening course"
        aria-label="Class name"
        className="h-11 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
      />

      <div>
        <p className="mb-2 text-label text-ink-2">Which days?</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() =>
                setWeekdays((current) =>
                  current.includes(index)
                    ? current.filter((day) => day !== index)
                    : [...current, index],
                )
              }
              aria-pressed={weekdays.includes(index)}
              className={cn(
                "h-11 w-12 rounded-sm text-caption transition-colors duration-[120ms]",
                weekdays.includes(index)
                  ? "bg-accent text-accent-on"
                  : "bg-subtle text-ink-2",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-2">Starts at</span>
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="h-11 rounded-sm border border-hairline-strong bg-surface px-3 text-body tabular text-ink"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-label text-ink-2">Minutes</span>
          <input
            type="number"
            min={5}
            max={600}
            step={15}
            value={durationMin}
            onChange={(event) => setDurationMin(Number(event.target.value))}
            className="h-11 w-24 rounded-sm border border-hairline-strong bg-surface px-3 text-body tabular text-ink"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-label text-ink-2">Where (optional)</span>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Room 12, or online"
            className="h-11 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-label text-ink-2">Meeting link (optional)</span>
        <input
          value={meetingUrl}
          onChange={(event) => setMeetingUrl(event.target.value)}
          inputMode="url"
          placeholder="meet.google.com/abc-defg-hij"
          className="h-11 rounded-sm border border-hairline-strong bg-surface px-3 text-body text-ink"
        />
        <span className="text-caption text-ink-3">
          Google Meet, Zoom, Teams — whatever your class uses. It becomes a Join
          button here and on Today.
        </span>
      </label>

      <div>
        <Button
          size="lg"
          loading={busy}
          onClick={handler(submit, () => setBusy(false))}
        >
          Add it
        </Button>
      </div>
    </Card>
  );
}

function describeRule(rule: Rule): string {
  const match = /BYDAY=([A-Z,]+)/.exec(rule.rrule);
  if (!match) return "weekly";

  const names: Record<string, string> = {
    MO: "Mon",
    TU: "Tue",
    WE: "Wed",
    TH: "Thu",
    FR: "Fri",
    SA: "Sat",
    SU: "Sun",
  };
  return match[1]!
    .split(",")
    .map((day) => names[day] ?? day)
    .join(", ");
}

function formatDay(dayKey: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T12:00:00Z`));
}
