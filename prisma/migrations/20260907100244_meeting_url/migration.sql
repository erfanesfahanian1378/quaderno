-- NOTE: Prisma also generated five
--   ALTER TABLE "<T>" ALTER COLUMN "searchText" DROP DEFAULT;
-- statements, which have been removed by hand — the same five as in
-- 20260907084042_phase_15_study_loop, for the same reason.
--
-- Those columns are Postgres GENERATED columns (20260907010000_search).
-- Prisma cannot express a generation expression, reads one as a DEFAULT, and
-- emits a statement to drop it, which Postgres rejects outright:
--   ERROR: column "searchText" ... is a generated column
--
-- Expect this in every future migration. tests/unit/migrations.spec.ts fails
-- the build if one of them ever becomes a DROP COLUMN.

-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN "meetingUrl" TEXT;

-- AlterTable
ALTER TABLE "ScheduledClass" ADD COLUMN "meetingUrl" TEXT;
