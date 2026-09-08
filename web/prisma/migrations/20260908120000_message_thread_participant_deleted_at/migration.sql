-- Per-participant "moved to trash" timestamp for message threads. Deleting a conversation only
-- sets this on the deleting user's own MessageThreadParticipant row (delete-for-me), so the
-- thread disappears from that user's Inbox/Requests and appears in their Trash. Cleared
-- automatically when a new message lands in the thread. A cron job purges rows past the 14-day
-- window and hard-deletes threads once every participant row is gone.
ALTER TABLE "MessageThreadParticipant" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "MessageThreadParticipant_userId_deletedAt_idx" ON "MessageThreadParticipant"("userId", "deletedAt");
