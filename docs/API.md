# API Reference

## Conventions

- Base path `/api`. Implemented as Next.js Route Handlers in `src/app/api/**`.
- **Mutations that come from a form or a simple button use Server Actions**;
  the JSON API exists for the viewer, the offline outbox, the timer, and any
  future mobile client. Do not duplicate a mutation in both.
- Auth: session cookie. Every handler begins with `await requireUser()`,
  which throws a 401 `ApiError`. There are no anonymous endpoints under
  `/api` except `/api/health`.
- Request and response bodies are validated by Zod schemas in
  `src/server/validation/**`, shared with the client for type inference.
- **Cursor pagination only.** `?limit=` (default 25, max 100) and `?cursor=`.
  Responses carry `{ items, nextCursor }`. `nextCursor: null` means the end.
- Times are ISO-8601 with offset. Dates without a time are `YYYY-MM-DD`.
- Errors are uniform:

```jsonc
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document not found",
    "details": { "field": "…" },
  },
}
```

Codes: `UNAUTHENTICATED` `FORBIDDEN` `NOT_FOUND` `VALIDATION_FAILED`
`CONFLICT` `QUOTA_EXCEEDED` `UNSUPPORTED_MEDIA_TYPE` `RATE_LIMITED`
`CONVERSION_FAILED` `INTERNAL`.

> A record owned by another user returns **404, never 403.** Existence is
> information; do not leak it.

---

## Auth

| Method   | Path                        | Notes                                                        |
| -------- | --------------------------- | ------------------------------------------------------------ |
| `*`      | `/api/auth/[...nextauth]`   | Auth.js v5 handler                                           |
| `POST`   | `/api/auth/register`        | `{ email, password, name }` → 201. Rate limited 3/h/IP       |
| `POST`   | `/api/auth/password/forgot` | Always 202, regardless of whether the email exists           |
| `POST`   | `/api/auth/password/reset`  | `{ token, password }` — invalidates all sessions             |
| `GET`    | `/api/me`                   | Profile, quota usage, languages, active timer                |
| `PATCH`  | `/api/me`                   | `{ name?, locale?, timeZone?, weekStartsOn?, theme? }`       |
| `POST`   | `/api/me/export`            | Queues a full data export (JSON + original files)            |
| `DELETE` | `/api/me`                   | Requires password re-entry. Queues 7-day-delayed hard delete |

---

## Languages, courses, classes

| Method           | Path                                                        | Notes                                                                                          |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET`            | `/api/languages`                                            | Includes this week's minutes and goal per language                                             |
| `POST`           | `/api/languages`                                            | `{ code, name, accentKey?, cefrLevel? }` — also creates the default course                     |
| `PATCH`          | `/api/languages/:id`                                        |                                                                                                |
| `DELETE`         | `/api/languages/:id`                                        | Archives; `?hard=true` requires the language be empty                                          |
| `GET`            | `/api/languages/:id/courses`                                |                                                                                                |
| `POST`           | `/api/courses`                                              | `{ languageId, name, teacher?, institution?, startsOn?, endsOn? }`                             |
| `PATCH` `DELETE` | `/api/courses/:id`                                          |                                                                                                |
| `GET`            | `/api/class-sessions`                                       | `?languageId&courseId&from&to&cursor`                                                          |
| `POST`           | `/api/class-sessions`                                       | `{ languageId, courseId?, date, title, topics?, summary? }`                                    |
| `PATCH` `DELETE` | `/api/class-sessions/:id`                                   |                                                                                                |
| `GET`            | `/api/scheduled-classes`                                    |                                                                                                |
| `POST`           | `/api/scheduled-classes`                                    | `{ languageId, title, rrule, startTime, durationMin, timeZone, startsOn, endsOn?, location? }` |
| `PATCH` `DELETE` | `/api/scheduled-classes/:id`                                |                                                                                                |
| `GET`            | `/api/schedule/upcoming`                                    | `?days=14` — expands RRULEs, merges real `ClassSession` rows over generated occurrences        |
| `POST`           | `/api/schedule/:scheduledClassId/occurrences/:date/confirm` | Materialises a `ClassSession` + a `SCHEDULE` study session                                     |

---

## Documents

| Method   | Path                              | Notes                                                                                                                          |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/documents`                  | `?languageId&courseId&classSessionId&tag&starred&q&cursor&sort=recent\|title\|created`                                         |
| `POST`   | `/api/documents`                  | Create a **NATIVE** document: `{ languageId, title, courseId?, classSessionId?, template? }`. Creates leaf 1 from the template |
| `GET`    | `/api/documents/:id`              | Document + ordered leaves + source files. **Not** annotations                                                                  |
| `PATCH`  | `/api/documents/:id`              | `{ title?, tags?, starred?, courseId?, classSessionId? }`                                                                      |
| `DELETE` | `/api/documents/:id`              | Soft delete (30-day trash). `POST /restore` to undo                                                                            |
| `POST`   | `/api/documents/:id/opened`       | Beacon; sets `lastOpenedAt`                                                                                                    |
| `GET`    | `/api/documents/:id/source-url`   | → `{ url, expiresAt }`, 5-min signed URL for the normalised PDF                                                                |
| `GET`    | `/api/documents/:id/original-url` | Signed URL for the untouched upload                                                                                            |
| `GET`    | `/api/documents/:id/events`       | **SSE**: conversion progress, `status` changes                                                                                 |

### Upload

Two-step, so bytes never pass through the Node process:

```
POST /api/uploads/presign
  { fileName, mimeType, byteSize, languageId, courseId?, classSessionId?, title? }
→ 201 { documentId, sourceFileId, uploadUrl, storageKey, headers }
     · validates MIME against the allowlist and byteSize against the quota
     · creates the Document with status = PENDING

PUT  <uploadUrl>            (direct to object storage)

POST /api/uploads/complete
  { sourceFileId, checksumSha256 }
→ 202 { documentId, status: "CONVERTING" }
     · verifies the object exists and its magic bytes match the claimed type
     · enqueues document.ingest
```

Then subscribe to `/api/documents/:id/events` for progress. `CONVERSION_FAILED`
arrives as an SSE event _and_ is persisted on the document, so a client that
was offline still sees it.

Allowlist: `application/pdf`, `.docx`, `.doc`, `.odt`, `.pptx`, `.ppt`,
`.odp`, `.rtf`, `.txt`, `.md`, `image/png`, `image/jpeg`, `image/webp`,
`image/heic`. Max 50 MB per file.

---

## Leaves (composition)

| Method   | Path                        | Notes                                                                                                                    |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/documents/:id/leaves` | Ordered; includes note-page content for `NOTE_PAGE`                                                                      |
| `POST`   | `/api/documents/:id/leaves` | `{ kind, afterLeafId?, template?, label? }`. `afterLeafId: null` prepends                                                |
| `PATCH`  | `/api/leaves/:id`           | `{ label?, rotation?, hidden? }`                                                                                         |
| `POST`   | `/api/leaves/:id/move`      | `{ afterLeafId }` → recomputes the fractional index. Returns `{ position }`                                              |
| `POST`   | `/api/leaves/:id/duplicate` | Note pages only                                                                                                          |
| `DELETE` | `/api/leaves/:id`           | Sets `hidden = true`. Source pages are never removed                                                                     |
| `GET`    | `/api/note-pages/:id`       |                                                                                                                          |
| `PUT`    | `/api/note-pages/:id`       | `{ content, contentJson?, pageSize?, orientation? }`. Autosave: 800 ms debounce, `If-Unmodified-Since` → 409 on conflict |

---

## Annotations & comments

| Method   | Path                                   | Notes                                                                                  |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET`    | `/api/documents/:id/annotations`       | `?since=<ISO>` for delta sync. Tombstones included when `since` is present             |
| `POST`   | `/api/documents/:id/annotations/batch` | The main write path — see `ANNOTATION_ENGINE.md §7`. ≤50 ops, idempotent on `clientId` |
| `GET`    | `/api/documents/:id/comments`          | `?resolved=false`                                                                      |
| `POST`   | `/api/documents/:id/comments`          | `{ body, leafId?, annotationId?, parentId? }`                                          |
| `PATCH`  | `/api/comments/:id`                    | `{ body?, resolvedAt? }`                                                               |
| `DELETE` | `/api/comments/:id`                    | Soft delete                                                                            |

Batch response:

```jsonc
{ "results": [
    { "clientId": "…", "ok": true,  "id": "cl…", "updatedAt": "…" },
    { "clientId": "…", "ok": false, "error": { "code": "VALIDATION_FAILED", … } }
] }
```

---

## Export

| Method | Path                        | Notes                                                                                                                                             |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/documents/:id/export` | `{ flavour: "flattened"\|"layered"\|"notes-only", leafIds? }`. ≤150 leaves → `{ mode: "client" }` and the browser does it. Otherwise queues a job |
| `GET`  | `/api/exports/:id`          | `{ status, downloadUrl? }`                                                                                                                        |

---

## Study tracking

| Method           | Path                         | Notes                                                                                               |
| ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET`            | `/api/study/timer`           | The user's open timer, or `null`                                                                    |
| `POST`           | `/api/study/timer/start`     | `{ languageId, activity?, documentId?, classSessionId? }`. 409 `CONFLICT` if one is already running |
| `POST`           | `/api/study/timer/heartbeat` | Every 60 s. Bumps `lastHeartbeatAt`                                                                 |
| `POST`           | `/api/study/timer/stop`      | `{ note? }` → the finished session, with the day aggregate updated in the same transaction          |
| `POST`           | `/api/study/timer/discard`   | Deletes without recording                                                                           |
| `GET`            | `/api/study/sessions`        | `?languageId&from&to&cursor`                                                                        |
| `POST`           | `/api/study/sessions`        | Manual log: `{ languageId, activity, startedAt, durationSec, note?, classSessionId?, documentId? }` |
| `PATCH` `DELETE` | `/api/study/sessions/:id`    | Recomputes affected day aggregates                                                                  |
| `GET`            | `/api/study/stats`           | `?languageId&from&to&granularity=day\|week\|month` → series from `StudyDayAggregate`                |
| `GET`            | `/api/study/heatmap`         | `?year=2026&languageId?` → `[{ day, totalSec }]`, one row per active day                            |
| `GET`            | `/api/study/streak`          | `{ current, longest, lastActiveDay }`                                                               |
| `GET` `PUT`      | `/api/study/goals`           | `PUT { languageId, targetMinutes }` writes a new `effectiveFrom = today` row                        |
| `GET`            | `/api/study/week`            | This week per language: `{ targetMinutes, actualMinutes, byDay[], pace }`                           |

---

## Search

| Method | Path          | Notes                                                           |
| ------ | ------------- | --------------------------------------------------------------- |
| `GET`  | `/api/search` | `?q&languageId&type=document\|note\|annotation\|comment&cursor` |

Postgres full-text with `pg_trgm` for fuzzy matching, plus an
`unaccent`-normalised column — searching `perche` must find `perché`, and
`etudier` must find `étudier`. That normalisation is not optional in an app
for Italian and French.

---

## System

| Method | Path           | Notes                                   |
| ------ | -------------- | --------------------------------------- |
| `GET`  | `/api/health`  | `{ db, storage, queueDepth, version }`  |
| `GET`  | `/api/metrics` | Prometheus text, bearer-token protected |

---

## Rate limits

Postgres token bucket, keyed by user or IP. Exceeding a limit returns 429 with
`Retry-After`.

| Bucket             | Limit                                  |
| ------------------ | -------------------------------------- |
| login attempts     | 5 / 15 min / account, 20 / 15 min / IP |
| registration       | 3 / hour / IP                          |
| uploads            | 20 / hour / user                       |
| annotation batches | 120 / min / user                       |
| general API        | 600 / min / user                       |
