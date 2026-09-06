-- CreateEnum
CREATE TYPE "DocumentOrigin" AS ENUM ('UPLOAD', 'NATIVE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'CONVERTING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "LeafKind" AS ENUM ('SOURCE_PAGE', 'NOTE_PAGE');

-- CreateEnum
CREATE TYPE "AnnotationKind" AS ENUM ('HIGHLIGHT', 'UNDERLINE', 'STRIKETHROUGH', 'INK', 'TEXT_BOX', 'SHAPE', 'COMMENT_PIN');

-- CreateEnum
CREATE TYPE "StudySource" AS ENUM ('TIMER', 'MANUAL', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "StudyActivity" AS ENUM ('CLASS', 'HOMEWORK', 'READING', 'REVIEW', 'LISTENING', 'SPEAKING', 'WRITING', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "storageQuotaBytes" BIGINT NOT NULL DEFAULT 2147483648,
    "storageUsedBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accentKey" TEXT NOT NULL DEFAULT 'accent-1',
    "cefrLevel" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacher" TEXT,
    "institution" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "startsOn" DATE,
    "endsOn" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledClass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "rrule" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "timeZone" TEXT NOT NULL,
    "location" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "courseId" TEXT,
    "scheduledClassId" TEXT,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "courseId" TEXT,
    "classSessionId" TEXT,
    "title" TEXT NOT NULL,
    "origin" "DocumentOrigin" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "leafCount" INTEGER NOT NULL DEFAULT 0,
    "thumbnailKey" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFile" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pdfStorageKey" TEXT,
    "pdfPageCount" INTEGER,
    "pdfByteSize" BIGINT,
    "conversionEngine" TEXT,
    "conversionMs" INTEGER,
    "conversionLog" TEXT,
    "hasTextLayer" BOOLEAN NOT NULL DEFAULT false,
    "ocrApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leaf" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" DECIMAL(30,15) NOT NULL,
    "kind" "LeafKind" NOT NULL,
    "sourceFileId" TEXT,
    "sourcePageIndex" INTEGER,
    "notePageId" TEXT,
    "label" TEXT,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leaf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotePage" (
    "id" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "content" TEXT NOT NULL,
    "contentJson" JSONB,
    "pageSize" TEXT NOT NULL DEFAULT 'A4',
    "orientation" TEXT NOT NULL DEFAULT 'portrait',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "leafId" TEXT NOT NULL,
    "kind" "AnnotationKind" NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'hl-yellow',
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "geometry" JSONB NOT NULL,
    "quotedText" TEXT,
    "textAnchor" JSONB,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "leafId" TEXT,
    "annotationId" TEXT,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "source" "StudySource" NOT NULL,
    "activity" "StudyActivity" NOT NULL DEFAULT 'OTHER',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "classSessionId" TEXT,
    "documentId" TEXT,
    "note" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyDayAggregate" (
    "userId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "totalSec" INTEGER NOT NULL DEFAULT 0,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyDayAggregate_pkey" PRIMARY KEY ("userId","languageId","day")
);

-- CreateTable
CREATE TABLE "WeeklyGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "targetMinutes" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Language_userId_archivedAt_idx" ON "Language"("userId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Language_userId_code_key" ON "Language"("userId", "code");

-- CreateIndex
CREATE INDEX "Course_userId_languageId_archivedAt_idx" ON "Course"("userId", "languageId", "archivedAt");

-- CreateIndex
CREATE INDEX "ScheduledClass_userId_active_idx" ON "ScheduledClass"("userId", "active");

-- CreateIndex
CREATE INDEX "ClassSession_userId_languageId_date_idx" ON "ClassSession"("userId", "languageId", "date");

-- CreateIndex
CREATE INDEX "ClassSession_userId_date_idx" ON "ClassSession"("userId", "date");

-- CreateIndex
CREATE INDEX "Document_userId_languageId_deletedAt_idx" ON "Document"("userId", "languageId", "deletedAt");

-- CreateIndex
CREATE INDEX "Document_userId_lastOpenedAt_idx" ON "Document"("userId", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "Document_classSessionId_idx" ON "Document"("classSessionId");

-- CreateIndex
CREATE INDEX "SourceFile_documentId_idx" ON "SourceFile"("documentId");

-- CreateIndex
CREATE INDEX "SourceFile_checksumSha256_idx" ON "SourceFile"("checksumSha256");

-- CreateIndex
CREATE UNIQUE INDEX "Leaf_notePageId_key" ON "Leaf"("notePageId");

-- CreateIndex
CREATE INDEX "Leaf_documentId_hidden_idx" ON "Leaf"("documentId", "hidden");

-- CreateIndex
CREATE UNIQUE INDEX "Leaf_documentId_position_key" ON "Leaf"("documentId", "position");

-- CreateIndex
CREATE INDEX "Annotation_documentId_updatedAt_idx" ON "Annotation"("documentId", "updatedAt");

-- CreateIndex
CREATE INDEX "Annotation_leafId_deletedAt_idx" ON "Annotation"("leafId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Annotation_userId_clientId_key" ON "Annotation"("userId", "clientId");

-- CreateIndex
CREATE INDEX "Comment_documentId_deletedAt_idx" ON "Comment"("documentId", "deletedAt");

-- CreateIndex
CREATE INDEX "Comment_annotationId_idx" ON "Comment"("annotationId");

-- CreateIndex
CREATE INDEX "StudySession_userId_languageId_startedAt_idx" ON "StudySession"("userId", "languageId", "startedAt");

-- CreateIndex
CREATE INDEX "StudySession_userId_endedAt_idx" ON "StudySession"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "StudyDayAggregate_userId_day_idx" ON "StudyDayAggregate"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyGoal_userId_languageId_effectiveFrom_key" ON "WeeklyGoal"("userId", "languageId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Language" ADD CONSTRAINT "Language_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledClass" ADD CONSTRAINT "ScheduledClass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledClass" ADD CONSTRAINT "ScheduledClass_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledClass" ADD CONSTRAINT "ScheduledClass_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_scheduledClassId_fkey" FOREIGN KEY ("scheduledClassId") REFERENCES "ScheduledClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFile" ADD CONSTRAINT "SourceFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leaf" ADD CONSTRAINT "Leaf_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leaf" ADD CONSTRAINT "Leaf_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "SourceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leaf" ADD CONSTRAINT "Leaf_notePageId_fkey" FOREIGN KEY ("notePageId") REFERENCES "NotePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_leafId_fkey" FOREIGN KEY ("leafId") REFERENCES "Leaf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_leafId_fkey" FOREIGN KEY ("leafId") REFERENCES "Leaf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "Annotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyDayAggregate" ADD CONSTRAINT "StudyDayAggregate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyDayAggregate" ADD CONSTRAINT "StudyDayAggregate_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;
