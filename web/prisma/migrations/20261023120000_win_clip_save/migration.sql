-- Permanent copies of "Watch your win" video clips (additive: new table only).
CREATE TABLE IF NOT EXISTS "WinClipSave" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "showTitle" TEXT,
    "momentAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'saved',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "s3Prefix" TEXT,
    "momentOffsetSec" DOUBLE PRECISION,
    "durationSec" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WinClipSave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WinClipSave_kind_refId_key" ON "WinClipSave"("kind", "refId");
CREATE INDEX IF NOT EXISTS "WinClipSave_buyerId_momentAt_idx" ON "WinClipSave"("buyerId", "momentAt");
CREATE INDEX IF NOT EXISTS "WinClipSave_status_updatedAt_idx" ON "WinClipSave"("status", "updatedAt");
