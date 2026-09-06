# Data Model

The authoritative schema is [`prisma/schema.prisma`](../prisma/schema.prisma).
This document explains _why_ it is shaped that way. If the two disagree, the
schema wins and this file is the bug.

---

## 1. The one idea that matters: documents are compositions, not files

Every other design in this app follows from a single decision:

> **A `Document` is an ordered list of `Leaf` rows. A leaf is either one page
> of a converted PDF, or a page the user wrote inside the app. The uploaded
> file is never modified.**

This is what makes the user's core requirement possible — _"add a page between
notes"_, _"write something on it"_, _"create new files to add my notes to
them"_ — without ever rewriting bytes the user gave us.

```
Document "Italiano — lezione 12"
├── Leaf pos=1.0    SOURCE_PAGE   handout.pdf p.0
├── Leaf pos=2.0    SOURCE_PAGE   handout.pdf p.1
├── Leaf pos=2.5    NOTE_PAGE     "my verb table"      <-- inserted, no file rewrite
├── Leaf pos=3.0    SOURCE_PAGE   handout.pdf p.2
└── Leaf pos=4.0    NOTE_PAGE     "homework for Thursday"
```

Consequences to keep in mind while implementing:

- **Deleting a page** sets `Leaf.hidden = true`. It never deletes a PDF page.
  The original file stays byte-identical and re-importable.
- **Reordering** writes one row. `position` is a fractional index
  (`Decimal(30,15)`); inserting between neighbours is `(a + b) / 2`. Renumber
  the whole document only when the gap between neighbours drops below `1e-9`.
- **A native note "file"** is just a `Document` with `origin = NATIVE` whose
  leaves are all `NOTE_PAGE`. There is no second code path for "notes" —
  the viewer, the annotation layer, search and export all treat it identically.
- **Re-uploading a corrected handout** adds a second `SourceFile` to the same
  document. Old leaves keep pointing at the old file, so nothing breaks; a
  migration UI can re-point them and re-anchor annotations by text.

---

## 2. Entity map

```
User
 ├─ Language              (it, fr — user-scoped, not a global lookup table)
 │   ├─ Course            ("B1 evening course", "Self-study")
 │   │   └─ ClassSession  (one dated lesson)
 │   │       └─ Document  (materials for that lesson)
 │   ├─ ScheduledClass    (RRULE -> expands into ClassSession)
 │   ├─ StudySession      (timer / manual / from schedule)
 │   ├─ StudyDayAggregate (pre-rolled daily totals)
 │   └─ WeeklyGoal
 └─ Document
     ├─ SourceFile        (original bytes + derived PDF)
     ├─ Leaf              (ordered page slots)
     │   ├─ NotePage      (markdown, when kind = NOTE_PAGE)
     │   ├─ Annotation    (highlight / ink / text box / shape / pin)
     │   └─ Comment
     └─ Comment           (document-level comments have leafId = null)
```

### Why `Language` is per-user and not a global table

The user renames it (`Italiano`), sets their own CEFR level on it, and picks
its accent colour. A shared lookup table would need a join table carrying all
of that anyway. `@@unique([userId, code])` keeps it honest.

### Why `Course` exists and is optional

Someone taking a formal course and doing self-study in the same language needs
the split. Someone who does not, does not want to think about it. Every
`Language` gets one `Course` with `isDefault = true` at creation, and the UI
hides the concept entirely until a second course exists.

---

## 3. Multi-tenancy: the rule that is never bent

**Every user-owned row carries `userId` directly, even when it is derivable
through a parent.** `Annotation.userId` is redundant with
`Annotation.document.userId` — keep it anyway.

Two reasons: authorisation checks never need a join, and a scoping bug can
never silently leak across tenants through a relation the query forgot to
constrain.

All reads go through the repository layer in `src/server/repositories/*`,
whose functions take an explicit `ctx: { userId }` first argument and inject
`where: { userId }` themselves. **No route handler builds a Prisma `where`
clause by hand.** See `CLAUDE.md`.

---

## 4. Soft deletes

| Model           | Delete strategy                                                       | Why                                                                                      |
| --------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Document`      | `deletedAt` — 30-day trash, then a cron hard-deletes it and its blobs | Users delete class notes by accident                                                     |
| `Annotation`    | `deletedAt`, kept 90 days                                             | An offline client must be able to learn that a mark it still holds was deleted elsewhere |
| `Comment`       | `deletedAt`                                                           | Preserves thread structure                                                               |
| `Leaf`          | `hidden` flag, never deleted                                          | Positions and annotation anchors must stay stable                                        |
| Everything else | hard delete                                                           | No reconciliation need                                                                   |

Add a Prisma client extension that appends `deletedAt: null` by default and
requires an explicit `includeDeleted: true` to see the rest.

---

## 5. Storage keys

Blobs never live in Postgres. `storageKey` is an S3-style object key:

```
u/{userId}/d/{documentId}/src/{sourceFileId}/original{ext}
u/{userId}/d/{documentId}/src/{sourceFileId}/normalised.pdf
u/{userId}/d/{documentId}/thumb/{leafId}.webp
u/{userId}/export/{exportId}.pdf
```

The `userId` prefix means a "delete my account" job is one prefix delete, and
a mis-scoped signed URL cannot reach another user's namespace.

`SourceFile.checksumSha256` deduplicates re-uploads of the same handout: if a
checksum already exists for that user, reuse the blob and skip conversion.

---

## 6. Annotation geometry

`Annotation.geometry` is `Json`, validated by a Zod schema chosen by `kind`.
Coordinates are **always normalised**: `x, y ∈ [0,1]` relative to the page's
un-rotated CropBox, origin top-left. Never store device pixels — the same
annotation has to land correctly on a 390 px phone and a 2560 px monitor.

```jsonc
// HIGHLIGHT / UNDERLINE / STRIKETHROUGH
{ "quads": [{ "x": .12, "y": .31, "w": .44, "h": .018 }, ...] }

// INK
{ "strokes": [ { "w": .004, "points": [[.10,.20],[.11,.21], ...] } ] }

// TEXT_BOX
{ "x": .2, "y": .4, "w": .5, "h": .1,
  "text": "questo è il passato prossimo",
  "fontSize": .018, "align": "left" }

// SHAPE
{ "shape": "arrow", "x1": .2, "y1": .3, "x2": .6, "y2": .5, "strokeW": .003 }

// COMMENT_PIN
{ "x": .78, "y": .12 }
```

Full rules, including the text re-anchoring algorithm, are in
[`ANNOTATION_ENGINE.md`](./ANNOTATION_ENGINE.md).

`color` stores a **token key** (`"hl-yellow"`), never a hex string. The viewer
inverts pages in dark mode, and the token indirection is what lets the same
highlight resolve to a different real colour in each theme.

---

## 7. Study tracking

Three write paths, one table:

| Source     | Created when                                               |
| ---------- | ---------------------------------------------------------- |
| `TIMER`    | user starts the in-app timer; `endedAt` null while running |
| `MANUAL`   | user logs "1h 30m of reading yesterday"                    |
| `SCHEDULE` | user confirms a `ScheduledClass` occurrence happened       |

**Live timers.** A running timer POSTs a heartbeat every 60 s. A reaper job
closes any session with `endedAt = null` and
`lastHeartbeatAt < now() - 20 minutes`, setting `endedAt = lastHeartbeatAt`.
This is why a closed laptop costs you at most one minute of logged time, not a
14-hour phantom session.

Enforce at most one running timer per user with a partial unique index
(raw SQL in a migration, Prisma cannot express it):

```sql
CREATE UNIQUE INDEX study_session_one_open_per_user
  ON "StudySession" ("userId") WHERE "endedAt" IS NULL;
```

**Aggregates.** `StudyDayAggregate` is written in the same transaction as the
`StudySession` that changes it. Every chart, the streak counter and the
heatmap read only the aggregate table — a year of heatmap data is then 365
rows per language instead of a scan over every session.

The `day` is computed in the **user's** time zone, not UTC. A 23:30 → 00:30
session splits across two days; the aggregation helper must handle the split.

**Goals** are versioned by `effectiveFrom` rather than overwritten, so raising
your target from 3 h to 5 h does not retroactively mark past weeks as failures.

---

## 8. Indexes that exist for a reason

| Index                                    | Serves                                         |
| ---------------------------------------- | ---------------------------------------------- |
| `Document(userId, lastOpenedAt)`         | "Continue where you left off" on the dashboard |
| `Annotation(documentId, updatedAt)`      | Delta sync: "everything changed since T"       |
| `Annotation(userId, clientId)` unique    | Offline replay idempotency                     |
| `StudyDayAggregate(userId, day)`         | Heatmap across all languages                   |
| `ClassSession(userId, languageId, date)` | Class timeline                                 |
| `SourceFile(checksumSha256)`             | Upload dedupe                                  |

Add nothing else until a query is proven slow with `EXPLAIN ANALYZE`. Indexes
cost write throughput and RAM, and this app is meant to fit in 2 GB.

---

## 9. Migration discipline

- One logical change per migration; never edit a migration that has run.
- Backfills go in the same migration as the column they fill, guarded so they
  are safe to re-run.
- The partial unique index above and the `pg_trgm` extension for search
  (`PHASE-09`) are raw SQL blocks inside otherwise normal Prisma migrations.
- `prisma migrate diff` output is reviewed in the PR body, not just the
  schema diff.
