-- NOTE: Prisma also generated five
--   ALTER TABLE "<T>" ALTER COLUMN "searchText" DROP DEFAULT;
-- statements, which have been removed by hand.
--
-- Those columns are Postgres GENERATED columns (20260907010000_search).
-- Prisma cannot express generation expressions, reads one as a DEFAULT, and
-- emits a statement to drop it — which Postgres rejects outright:
--   ERROR: column "searchText" ... is a generated column
--
-- The columns are declared in schema.prisma purely so that `migrate dev` does
-- not instead offer to DROP them, which would silently delete search. Expect
-- to strip these five lines from future migrations too; tests/unit/migrations
-- .spec.ts fails the build if one ever turns into a DROP COLUMN.

-- DropIndex
DROP INDEX "annotation_search_trgm";

-- DropIndex
DROP INDEX "class_session_search_trgm";

-- DropIndex
DROP INDEX "comment_search_trgm";

-- DropIndex
DROP INDEX "document_search_trgm";

-- DropIndex
DROP INDEX "note_page_search_trgm";

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- CreateTable
CREATE TABLE "ReviewCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notePageId" TEXT NOT NULL,
    "languageId" TEXT,
    "row" INTEGER NOT NULL,
    "rowKey" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "example" TEXT,
    "note" TEXT,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueOn" TEXT NOT NULL,
    "lastGradedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "intervalBefore" INTEGER NOT NULL,
    "intervalAfter" INTEGER NOT NULL,
    "easeAfter" DOUBLE PRECISION NOT NULL,
    "elapsedMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notePageId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'AUDIO',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewCard_userId_dueOn_idx" ON "ReviewCard"("userId", "dueOn");

-- CreateIndex
CREATE INDEX "ReviewCard_userId_languageId_dueOn_idx" ON "ReviewCard"("userId", "languageId", "dueOn");

-- CreateIndex
CREATE INDEX "ReviewCard_notePageId_idx" ON "ReviewCard"("notePageId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCard_notePageId_rowKey_key" ON "ReviewCard"("notePageId", "rowKey");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_createdAt_idx" ON "ReviewLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewLog_cardId_createdAt_idx" ON "ReviewLog"("cardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_userId_createdAt_idx" ON "ShareLink"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ShareLink_documentId_idx" ON "ShareLink"("documentId");

-- CreateIndex
CREATE INDEX "NoteAsset_userId_createdAt_idx" ON "NoteAsset"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NoteAsset_notePageId_idx" ON "NoteAsset"("notePageId");

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_notePageId_fkey" FOREIGN KEY ("notePageId") REFERENCES "NotePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ReviewCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAsset" ADD CONSTRAINT "NoteAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAsset" ADD CONSTRAINT "NoteAsset_notePageId_fkey" FOREIGN KEY ("notePageId") REFERENCES "NotePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
