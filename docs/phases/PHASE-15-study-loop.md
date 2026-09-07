# PHASE 15 — The study loop

**Goal:** the roadmap. Everything so far captures and organises what happened
in class. This phase is about *using* it — turning a vocabulary table into
something you actually revise from.

**Prerequisites:** Phases 01–14. Each item is independent; ship them in the
order below, which is by value.

## 1. Spaced repetition from vocabulary tables

The vocabulary and verb-conjugation templates already exist and produce a
predictable markdown table. That is the input.

- Parse `NotePage.content` for tables matching the vocabulary shape
  (word / translation / example / note). No new editor, no new model for the
  user to learn — a table they already filled in becomes a deck.
- New model `ReviewCard` (`noteePageId`, `row`, `front`, `back`, `ease`,
  `intervalDays`, `dueOn`, `lapses`) and `ReviewLog`.
- **FSRS or SM-2.** SM-2 is 40 lines and well understood; FSRS is better and
  is a dependency. Start with SM-2, note the trade in the PR.
- A review screen: front, reveal, then Again / Hard / Good / Easy.
- Due counts on the language home and the dashboard.
- **Read-aloud on the card**, reusing `PronouncePanel`'s speech synthesis —
  hearing the word is half of learning it.

**Careful:** the table is the source of truth and the user keeps editing it.
Re-parsing must *update* cards by row identity, not delete and recreate them,
or every edit resets everyone's review history.

## 2. Audio attachments on note pages

- Record with `MediaRecorder` on a note page; store via the existing presigned
  upload path with a `noteAssetKey`.
- Play back inline. Show a waveform only if it is cheap; a duration and a
  play button is enough.
- **Pair it with read-aloud**: record yourself, then hear the reference voice,
  and compare. That comparison is the actual feature.
- `getUserMedia` needs a **secure context** — the same rule that broke
  `crypto.randomUUID` and blocks service workers on a LAN IP. It will not work
  on `http://192.168.x.x`.

## 3. Shared read-only document links

- `ShareLink` model: `documentId`, `token`, `expiresAt`, `revokedAt`.
- A public route `/s/[token]` that renders the viewer read-only: no toolbar,
  no outbox, no comments composition.
- **The tenancy rule still holds.** A share token grants access to exactly one
  document and nothing else; the repository still scopes by the owner's
  `userId`, resolved from the token. Do not add a "public" branch to the
  repository layer.
- Rate limit the public route; it is the only unauthenticated surface in the
  app besides `/api/health`.
- Revocable from the document's Info tab, and listed in settings.

## 4. Anki export

- `.apkg` is a zip containing a SQLite database. `sql.js` in a worker can
  write one, but it is ~1.5 MB.
- **Start with TSV**, which Anki imports natively and which is twenty lines:
  `front \t back \t tags`. Offer `.apkg` only if someone asks.
- Export a language, a document, or a single vocabulary table.

## Key files

```
prisma/schema.prisma                 ReviewCard, ReviewLog, ShareLink
src/server/services/review/{parse.ts,schedule.ts}
src/app/(app)/review/page.tsx
src/components/review/{Card.tsx,Grades.tsx}
src/components/editor/AudioAttachment.tsx
src/app/s/[token]/page.tsx
src/lib/export/anki.ts
tests/unit/review/{parse.spec.ts,sm2.spec.ts}
```

## Acceptance criteria

- [ ] A filled-in vocabulary table becomes a deck without the user doing
      anything but filling it in.
- [ ] Editing a row updates its card and **preserves its review history**;
      deleting a row retires the card rather than orphaning it.
- [ ] Grading a card schedules it, and the due count on the dashboard changes.
- [ ] A card can be heard aloud in the language being studied.
- [ ] A recorded clip plays back after a reload, and counts against the
      storage quota.
- [ ] A share link opens the document read-only for a signed-out visitor, and
      revoking it returns 404 — not 403.
- [ ] A share token for document A cannot read document B.
- [ ] The TSV export imports into Anki with fields in the right order.
