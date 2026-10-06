-- Sweet 16 Break: turn-based live draft deciding which team each of the 16 blind-slot buyers
-- gets, once all 16 slots on the item are sold.

-- New assignment mode: buy a blind numbered slot now, get the team later via a live draft.
ALTER TYPE "LiveItemVariantAssignmentMode" ADD VALUE IF NOT EXISTS 'draft';

CREATE TYPE "LiveSweet16DraftStatus" AS ENUM ('not_started', 'in_progress', 'complete');

CREATE TABLE "LiveSweet16Draft" (
    "liveRoomItemId" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "status" "LiveSweet16DraftStatus" NOT NULL DEFAULT 'not_started',
    "turnOrder" JSONB NOT NULL,
    "currentTurnIndex" INTEGER,
    "currentTurnPurchaseId" TEXT,
    "currentTurnDeadlineAt" TIMESTAMP(3),
    "remainingTeamLabels" JSONB NOT NULL,
    "turnSeconds" INTEGER NOT NULL DEFAULT 60,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSweet16Draft_pkey" PRIMARY KEY ("liveRoomItemId")
);

CREATE TABLE "LiveSweet16DraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "teamLabel" TEXT NOT NULL,
    "teamAbbr" TEXT NOT NULL,
    "autoAssigned" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveSweet16DraftPick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LiveSweet16Draft_liveRoomId_idx" ON "LiveSweet16Draft"("liveRoomId");

CREATE INDEX "LiveSweet16Draft_status_currentTurnDeadlineAt_idx" ON "LiveSweet16Draft"("status", "currentTurnDeadlineAt");

CREATE UNIQUE INDEX "LiveSweet16DraftPick_purchaseId_key" ON "LiveSweet16DraftPick"("purchaseId");

CREATE UNIQUE INDEX "LiveSweet16DraftPick_draftId_teamLabel_key" ON "LiveSweet16DraftPick"("draftId", "teamLabel");

CREATE INDEX "LiveSweet16DraftPick_liveRoomId_idx" ON "LiveSweet16DraftPick"("liveRoomId");

ALTER TABLE "LiveSweet16Draft" ADD CONSTRAINT "LiveSweet16Draft_liveRoomItemId_fkey" FOREIGN KEY ("liveRoomItemId") REFERENCES "LiveRoomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveSweet16Draft" ADD CONSTRAINT "LiveSweet16Draft_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveSweet16DraftPick" ADD CONSTRAINT "LiveSweet16DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "LiveSweet16Draft"("liveRoomItemId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveSweet16DraftPick" ADD CONSTRAINT "LiveSweet16DraftPick_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "LiveItemVariantPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
