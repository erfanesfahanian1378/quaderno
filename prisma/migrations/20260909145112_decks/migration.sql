-- searchText DROP DEFAULT statements removed by hand; see 20260907084042.

-- AlterTable
ALTER TABLE "ReviewCard" ADD COLUMN     "deckId" TEXT,
ALTER COLUMN "notePageId" DROP NOT NULL;
-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Deck_userId_languageId_idx" ON "Deck"("userId", "languageId");
-- CreateIndex
CREATE INDEX "ReviewCard_deckId_idx" ON "ReviewCard"("deckId");
-- AddForeignKey
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;
