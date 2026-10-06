-- Per-person message delete (additive, all nullable): Deleted area with 14-day retention.
-- AlterTable
ALTER TABLE "MessageThreadParticipant" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "purgedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MessageThreadParticipant_deletedAt_idx" ON "MessageThreadParticipant"("deletedAt");
