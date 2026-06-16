-- CreateEnum
CREATE TYPE "MessageMentionSourceType" AS ENUM ('live_room_message', 'thread_message');

-- CreateTable
CREATE TABLE "MessageMention" (
    "id" TEXT NOT NULL,
    "sourceType" "MessageMentionSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "mentionedByUserId" TEXT NOT NULL,
    "usernameSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageMention_mentionedUserId_createdAt_idx" ON "MessageMention"("mentionedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageMention_sourceType_sourceId_idx" ON "MessageMention"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageMention_sourceType_sourceId_mentionedUserId_key" ON "MessageMention"("sourceType", "sourceId", "mentionedUserId");

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_mentionedByUserId_fkey" FOREIGN KEY ("mentionedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
