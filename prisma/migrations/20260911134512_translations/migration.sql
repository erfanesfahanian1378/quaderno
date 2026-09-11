-- Prisma re-emits `ALTER COLUMN "searchText" DROP DEFAULT` on every
-- migration because it cannot express a GENERATED column. Those lines are
-- stripped by hand here; applying them destroys full-text search.

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "translated" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Translation_createdAt_idx" ON "Translation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_sourceLang_targetLang_sourceText_key" ON "Translation"("sourceLang", "targetLang", "sourceText");
