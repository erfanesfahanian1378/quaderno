# PHASE 08 — Study tracking

**Goal:** honest numbers. The timer, the manual log, the class schedule, weekly
goals, and every chart on the dashboard and the stats screen.

**Prerequisites:** Phases 01–07. Read `DATA_MODEL.md §7`.

## Scope

1. **Repositories & services** for `StudySession`, `StudyDayAggregate`,
   `WeeklyGoal`, `ScheduledClass`.
2. **Aggregate maintenance** — every session write updates the affected
   `StudyDayAggregate` rows **in the same transaction**. A session crossing
   midnight in the user's time zone splits across two days. Edits and deletes
   recompute correctly.
3. **The partial unique index** enforcing one open timer per user (raw SQL in a
   migration).
4. **Timer** — start / heartbeat (60 s) / stop / discard per `API.md`. The
   client keeps its own elapsed clock and reconciles with the server on
   heartbeat, so a sleeping tab does not drift. Timer state survives a reload
   and is picked up on another device.
5. **Reaper job** — closes sessions with `endedAt = null` and
   `lastHeartbeatAt < now() - 20 min`, setting `endedAt = lastHeartbeatAt`.
   Runs every 5 minutes.
6. **Timer UI** — the pill and focus mode from design brief §5.9. The pill must
   never obstruct the annotation toolbar; on mobile it collapses to a dot when
   the toolbar is open. Starting a timer while a document is open links the
   session to that document automatically.
7. **Manual logging** — the sheet from §5.9, with duration quick-chips.
8. **Recurring classes** — RRULE storage, expansion with `rrule.js`, DST-safe
   (wall time in the stored IANA zone, not a fixed offset).
   `GET /api/schedule/upcoming` merges materialised `ClassSession` rows over
   generated occurrences so a confirmed class is never shown twice.
9. **Attendance confirmation** — a past unconfirmed occurrence prompts
   "attended?"; yes creates the `ClassSession` and a `SCHEDULE` study session
   of the scheduled duration.
10. **Goals** — `PUT /api/study/goals` writes a new `effectiveFrom` row rather
    than overwriting, so history stays truthful. Pace calculation:
    expected-so-far vs. actual, using the user's `weekStartsOn`.
11. **Charts** — weekly stacked bars with a dashed goal line, per-language
    comparison, activity breakdown, and the **year heatmap** (53×7, four
    intensity steps from the language accent, month and weekday labels,
    hover tooltip, horizontally scrollable on mobile). All read
    `StudyDayAggregate` only.
12. **Streaks** — `GET /api/study/streak`, computed in the user's time zone,
    with a configurable minimum minutes/day to count (default 10). Plain
    presentation, no guilt.
13. **Dashboard wiring** — the goal rings, "this week" bars, next-class card
    and "continue" row all become real.

## Out of scope

Notifications and reminders (roadmap). Calendar (ICS) import/export.

## Key files

```
src/server/repositories/{study-session.ts,study-aggregate.ts,weekly-goal.ts,
  scheduled-class.ts}
src/server/services/study/{timer.ts,aggregate.ts,stats.ts,streak.ts,
  goals.ts,schedule.ts}
src/app/api/study/**  src/app/api/scheduled-classes/**  src/app/api/schedule/**
src/components/study/{TimerPill.tsx,FocusMode.tsx,ManualLogSheet.tsx,
  GoalRing.tsx,ActivityChips.tsx}
src/components/charts/{WeeklyBars.tsx,Heatmap.tsx,LanguageComparison.tsx,
  ActivityBreakdown.tsx}
src/app/(app)/study/**  src/app/(app)/l/[languageId]/stats/page.tsx
worker/jobs/timer-reaper.ts
tests/unit/study/{aggregate.spec.ts,streak.spec.ts,rrule.spec.ts}
```

## Acceptance criteria

- [ ] Start a timer, close the laptop, reopen four hours later: the session is
      recorded as ending at its last heartbeat (±60 s), **not** four hours.
- [ ] Starting a second timer while one runs returns 409.
- [ ] A session from 23:30 to 00:30 in `Europe/Rome` produces 30 minutes on
      each of two `StudyDayAggregate` days.
- [ ] Editing a past session's duration updates the aggregate, the weekly bar
      and the streak — asserted in one integration test.
- [ ] A weekly class at 18:30 Europe/Rome still generates 18:30 local
      occurrences across the March and October DST changes.
- [ ] Confirming attendance on a past occurrence creates exactly one
      `ClassSession` and one `SCHEDULE` session, and is idempotent if the
      request is repeated.
- [ ] Raising the weekly goal does not change how past weeks are reported.
- [ ] The heatmap for a year with 300 active days renders from **one query**
      returning ≤365 rows per language, in under 120 ms p95.
- [ ] All charts carry direct labels and are readable in both themes and by
      someone who cannot distinguish the accent colours.
