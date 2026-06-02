-- Variant team-break lifecycle: all spots sold → ready → host begins break.
ALTER TABLE "LiveRoomItem" ADD COLUMN "variantBreakReadyAt" TIMESTAMP(3);
ALTER TABLE "LiveRoomItem" ADD COLUMN "variantBreakBeganAt" TIMESTAMP(3);
