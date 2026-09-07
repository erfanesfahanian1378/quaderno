# PHASE 10 — Comments & the revision rail

**Goal:** finish the annotation surface. Marks exist and persist; you cannot
yet read them back as a set, or hold a conversation with yourself about one.
That reading-back is what makes the app useful the night before an exam.

**Prerequisites:** Phases 01–09. The comment API, repository and schema are
**already done and tested** — this phase is the UI for them, plus the
annotations list.

## Scope

1. **Right rail, 320 px, toggleable** (desktop) with three tabs, per
   `DESIGN_BRIEF.md §5.7`:
   - **Comments** — threads, one level deep, resolvable. Clicking a thread
     scrolls its page into view and pulses the mark.
   - **Annotations** — every highlight with its quoted text, filterable by
     colour label. This is the revision view and it is the most valuable
     screen in this phase; treat it as the deliverable, not a list.
   - **Info** — source file, conversion engine, the "layout may differ,
     original kept" notice, tags, class link.
2. **Bottom sheet on mobile** carrying the same three tabs. The sheet must
   not fight the annotation toolbar: opening it collapses the toolbar to the
   tool pill only.
3. **Connector line** from a highlight to its open thread in the rail
   (desktop only — there is no room on a phone and it would cross the sheet).
4. **Comment composition on an existing mark.** Tapping a highlight offers
   "add a comment"; the pin flow already writes a thread and should reuse the
   same component.
5. **Resolve / unresolve**, with resolved threads collapsed behind a count
   rather than hidden — a resolved question you cannot find again is lost.
6. **Highlighter labels in the list.** The five labels are already
   user-editable in settings and stored per browser; the filter chips read
   from the same source.
7. **Empty, loading and error states** for all three tabs.

## Out of scope

Real-time collaboration. Comment notifications. Threading deeper than one
level (`Comment.parentId` supports it; the UI deliberately does not).

## Key files

```
src/components/viewer/comments/{CommentsPanel.tsx,CommentThread.tsx,
  CommentComposer.tsx}
src/components/viewer/annotations/AnnotationList.tsx
src/components/viewer/InfoPanel.tsx
src/components/viewer/RightRail.tsx        desktop rail + mobile sheet
src/components/ui/{Sheet.tsx,Tabs.tsx}     missing primitives
tests/e2e/comments.spec.ts
```

## Notes from the work already done

- `src/server/repositories/comment.ts` and
  `src/app/api/documents/[documentId]/comments/route.ts` are complete and
  scoped. `PATCH /api/comments/:id` takes `{ body?, resolved? }`.
- A comment can hang off a highlight (`annotationId`), off a page (`leafId`),
  or off the document (both null). The rail has to render all three.
- The pin flow in `InlineComposer` already posts a comment on creation. Reuse
  that component rather than writing a second composer — it is the one that
  solves the mobile keyboard problem.
- The annotations store holds everything in memory already
  (`useAnnotations().all`), so the list needs no new fetch.

## Acceptance criteria

- [ ] Every highlight in a document appears in the Annotations tab with its
      quoted text, and filtering by colour label narrows it.
- [ ] Clicking an annotation row scrolls its page into view and pulses the
      mark for ~600 ms.
- [ ] A comment can be added to an existing highlight, replied to once, and
      resolved; resolving collapses it behind a count rather than hiding it.
- [ ] The mobile sheet opens over the page without covering the tool pill,
      and dismisses on swipe-down and on back.
- [ ] The Info tab shows the conversion notice for a `.docx`-derived document
      and nothing misleading for a native one.
- [ ] A document with no comments and no highlights shows two distinct empty
      states, neither of which is a spinner.
- [ ] Tenancy suite still green.
