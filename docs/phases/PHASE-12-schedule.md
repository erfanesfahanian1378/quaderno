# PHASE 12 — The schedule: recurring classes & attendance

**Goal:** make the promise in onboarding true — *"we'll ask if you attended,
so your hours log themselves."* Today that line is a lie: `ScheduledClass`
exists in the schema and nothing expands it.

**Prerequisites:** Phases 01–09. `StudySession`, `StudyDayAggregate` and the
timer are done and correct, including the day-splitting maths in
`src/lib/time.ts`.

## Scope

1. **RRULE storage and expansion** with `rrule.js`. Store the wall time and
   the IANA zone (`ScheduledClass.startTime` + `.timeZone`) and expand **in
   that zone**, never as a fixed offset.
2. **`GET /api/schedule/upcoming?days=14`** — expands the rules, then
   **merges materialised `ClassSession` rows over generated occurrences**, so
   a class that has already been confirmed is never shown twice.
3. **Attendance confirmation.**
   `POST /api/schedule/:scheduledClassId/occurrences/:date/confirm`
   creates, in one transaction: a `ClassSession` and a `SCHEDULE`
   `StudySession` of the scheduled duration, with its day aggregates. It must
   be **idempotent** — a repeated request creates nothing new.
4. **Declining.** "No, I didn't go" creates a `ClassSession` with
   `attended = false` and **no** study session. Silence is not the same as a
   no, and the prompt must keep appearing until answered.
5. **The recurring-class editor**: day-of-week toggles, a time, a duration, a
   location, a start date and an optional end date.
6. **Schedule screen** per `DESIGN_BRIEF.md §5.11`: a week grid with blocks in
   language accents on desktop, an agenda list grouped by day on mobile. A
   past unconfirmed occurrence shows an inline "attended? yes / no".
7. **Dashboard wiring**: the "Next class" card reads from
   `/api/schedule/upcoming` rather than only from materialised rows.

## Out of scope

Calendar (ICS) import or export. Notifications and reminders. Exceptions to a
rule (a one-off cancellation) — note it in the roadmap rather than modelling
`EXDATE` now.

## Key files

```
src/server/repositories/scheduled-class.ts
src/server/services/study/schedule.ts
src/server/validation/schedule.ts
src/app/api/scheduled-classes/**
src/app/api/schedule/upcoming/route.ts
src/app/api/schedule/[scheduledClassId]/occurrences/[date]/confirm/route.ts
src/app/(app)/schedule/page.tsx
src/components/study/{ScheduleGrid.tsx,ScheduleAgenda.tsx,
  RecurringClassEditor.tsx,AttendancePrompt.tsx}
tests/unit/study/rrule.spec.ts
```

## The part that will bite

**DST.** A class at 18:30 Europe/Rome must generate 18:30 local occurrences
across both the March and October transitions. `rrule.js` works in UTC
internally, so the correct shape is:

1. expand the rule in *floating* local time,
2. interpret each result as a wall time in the stored IANA zone,
3. convert to an instant.

Expanding in UTC and adding a fixed offset gives you 17:30 for half the year,
and the bug is invisible until someone misses a class. `src/lib/time.ts`
already has `startOfDayInZone` and the offset maths this needs — extend it
rather than reaching for a second date library.

## Acceptance criteria

- [ ] A weekly class at 18:30 Europe/Rome generates 18:30 local occurrences
      either side of both DST changes — a unit test over a full year.
- [ ] `GET /api/schedule/upcoming` never returns both a generated occurrence
      and its materialised `ClassSession`.
- [ ] Confirming attendance creates exactly one `ClassSession` and one
      `SCHEDULE` study session, and repeating the request creates nothing.
- [ ] Declining creates a `ClassSession` with `attended = false` and no study
      session, and the prompt stops appearing.
- [ ] The confirmed hours appear in the dashboard ring and the week bars
      immediately, because the aggregate was written in the same transaction.
- [ ] Deleting a `ScheduledClass` leaves already-confirmed `ClassSession`
      rows intact (`onDelete: SetNull` is already the schema's answer).
- [ ] Tenancy suite green with the new repository.
