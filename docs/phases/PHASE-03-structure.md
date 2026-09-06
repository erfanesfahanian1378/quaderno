# PHASE 03 — Learning structure & app shell

**Goal:** the app has a navigable shell, and a user can set up their languages,
courses and class sessions. Documents do not exist yet, but everything is ready
to hang them off.

**Prerequisites:** Phases 01–02.

## Scope

1. **Repositories & services** for `Language`, `Course`, `ClassSession`,
   following the Phase 02 base exactly. Creating a language also creates its
   default course in the same transaction.
2. **Endpoints** — the Languages / Courses / Classes tables in `API.md`.
   Cursor pagination on `class-sessions`.
3. **App shell** — `src/app/(app)/layout.tsx`: desktop sidebar (languages with
   accent dots, dashboard, study, settings), mobile bottom tab bar, a
   responsive header, and the ⌘K command palette scaffold (no results yet).
4. **Onboarding** — the three-step flow from design brief §5.2, shown when a
   user has no languages. Skippable, resumable.
5. **Language management** — create, rename, set CEFR, pick an accent from the
   six tokens, reorder by drag, archive. Settings § for it.
6. **Courses** — create/edit/archive; the UI hides courses entirely while a
   language has only the default one.
7. **Class sessions** — timeline UI per design brief §5.5: create, edit, mark
   attended, topics as chips, summary. Month grouping. Empty state.
8. **Dashboard skeleton** — greeting, language cards with a goal ring rendering
   zeroes, next-class card, and empty "continue" and "this week" sections with
   proper empty states. The data wiring lands in Phase 08.
9. **Design-system components** used here, built into `src/components/ui/`:
   Button, Input, Select, Chip, Badge, Dialog, Bottom sheet, Dropdown menu,
   Tabs, Empty state, Skeleton, Toast, Progress ring, Language pill.

## Out of scope

Scheduled classes and RRULE (Phase 08). Documents and uploads (Phase 04). Real
study numbers (Phase 08).

## Key files

```
src/server/repositories/{language.ts,course.ts,class-session.ts}
src/server/services/{language.ts,course.ts,class-session.ts}
src/server/validation/{language.ts,course.ts,class-session.ts}
src/app/api/languages/**  src/app/api/courses/**  src/app/api/class-sessions/**
src/app/(app)/layout.tsx
src/app/(app)/dashboard/page.tsx
src/app/(app)/l/[languageId]/{page.tsx,classes/page.tsx}
src/app/(app)/onboarding/page.tsx
src/app/(app)/settings/languages/page.tsx
src/components/ui/**
src/components/nav/{Sidebar.tsx,MobileTabBar.tsx,CommandPalette.tsx}
```

## Acceptance criteria

- [ ] A new user is sent to onboarding, adds Italian and French, and lands on a
      dashboard showing both with their accents.
- [ ] Creating a language creates exactly one default course
      (`isDefault = true`), asserted in an integration test.
- [ ] Adding a second course to a language makes the course selector appear;
      removing it hides it again.
- [ ] The class timeline renders 200 sessions without layout jank and paginates
      by cursor.
- [ ] Archiving a language hides it from navigation but keeps its data
      reachable from settings.
- [ ] Every screen in this phase works at 390 px and at 1440 px, and at 200%
      zoom without horizontal scroll.
- [ ] Tenancy suite green with the three new repositories.
