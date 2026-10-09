-- Random-reveal compliance + Surprise Sets (additive, nullable; safe on a live table).
-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adultConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LiveRoomItem" ADD COLUMN IF NOT EXISTS "surpriseSetItems" JSONB;
