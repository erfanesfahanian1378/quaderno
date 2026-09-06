-- One running timer per user.
--
-- DATA_MODEL.md §7 specifies this as raw SQL because Prisma cannot express a
-- PARTIAL unique index. Without the WHERE clause the index would forbid a user
-- from ever having two FINISHED sessions, which is the opposite of what we
-- want.
--
-- The service checks for an open timer first and returns a clean 409, but the
-- check-then-insert is a race: two taps on "start" in the same second both see
-- no timer. This index is what actually makes the invariant true.

CREATE UNIQUE INDEX IF NOT EXISTS "study_session_one_open_per_user"
  ON "StudySession" ("userId")
  WHERE "endedAt" IS NULL;

-- Serves the reaper's sweep for abandoned timers without scanning the table.
CREATE INDEX IF NOT EXISTS "study_session_open_heartbeat"
  ON "StudySession" ("lastHeartbeatAt")
  WHERE "endedAt" IS NULL;
