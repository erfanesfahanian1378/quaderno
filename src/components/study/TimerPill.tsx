"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/time";
import type { AccentKey } from "@/lib/tokens";

/**
 * The persistent timer pill. DESIGN_BRIEF §5.9.
 *
 * Two behaviours matter:
 *
 *   - The client keeps its OWN elapsed clock and reconciles on each heartbeat,
 *     so a backgrounded tab whose timers are throttled does not drift.
 *   - The accent ring breathes very slowly while running (4s, ~3% scale), and
 *     is disabled under prefers-reduced-motion.
 *
 * It must never cover the annotation toolbar, so on the viewer route it
 * collapses to a dot.
 */

export type ActiveTimer = {
  id: string;
  languageId: string;
  startedAt: string;
  activity: string;
};

const HEARTBEAT_MS = 60_000;

export function TimerPill({
  languages,
  collapsed = false,
}: {
  languages: { id: string; name: string; accentKey: string }[];
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef<number>(0);

  const load = useCallback(async () => {
    const result = await api.get<{ timer: ActiveTimer | null }>(
      "/api/study/timer",
    );
    if (!result.ok) return;

    setTimer(result.data.timer);
    if (result.data.timer) {
      startedAtRef.current = new Date(result.data.timer.startedAt).getTime();
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The local clock. Derived from a timestamp rather than incremented, so a
  // throttled tab catches up rather than losing seconds.
  useEffect(() => {
    if (!timer) return;
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [timer]);

  useEffect(() => {
    if (!timer) return;
    const beat = setInterval(() => {
      void api.post("/api/study/timer/heartbeat");
    }, HEARTBEAT_MS);
    return () => clearInterval(beat);
  }, [timer]);

  const stop = async () => {
    setBusy(true);
    await api.post("/api/study/timer/stop", {});
    setTimer(null);
    setElapsed(0);
    setBusy(false);
    router.refresh();
  };

  if (!timer) return null;

  const language = languages.find((entry) => entry.id === timer.languageId);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => void stop()}
        data-accent={(language?.accentKey ?? "accent-1") as AccentKey}
        aria-label={`Stop the timer — ${formatDuration(elapsed)} so far`}
        className="fixed bottom-24 right-4 z-30 size-4 rounded-full bg-accent shadow-e2 lg:bottom-6"
      />
    );
  }

  return (
    <div
      data-accent={(language?.accentKey ?? "accent-1") as AccentKey}
      className="fixed bottom-24 right-4 z-30 lg:bottom-6"
    >
      <div className="relative">
        {/* The breathing ring. Motion-reduce turns it off entirely. */}
        <span
          aria-hidden="true"
          className="absolute -inset-1 animate-[qbreathe_4s_ease-in-out_infinite] rounded-full border-2 border-accent opacity-60 motion-reduce:animate-none"
        />

        <div className="relative flex items-center gap-3 rounded-full border border-hairline bg-surface py-2 pl-3 pr-2 shadow-e2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full bg-accent"
          />
          <span className="text-body-sm text-ink-2">
            {language?.name ?? "Studying"}
          </span>
          <span className="tabular text-h3 text-ink">
            {formatClock(elapsed)}
          </span>
          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy}
            aria-label="Stop the timer"
            className="grid size-9 place-items-center rounded-full bg-subtle text-ink-2 transition-colors duration-[120ms] hover:bg-inset hover:text-ink disabled:opacity-50"
          >
            <span aria-hidden="true" className="size-3 rounded-[2px] bg-ink" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tabular hh:mm:ss so the pill does not shimmy as digits change. */
function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
