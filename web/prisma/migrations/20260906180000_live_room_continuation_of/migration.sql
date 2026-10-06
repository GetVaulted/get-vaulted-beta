-- Additive-only: nullable self-reference on "LiveRoom" so a new show can be auto-linked as the
-- continuation of a recently-ended show from the same seller (see
-- findRecentEndedLiveRoomIdForContinuation). This is what lets a returning buyer's live-show
-- shipping cap carry forward instead of resetting to $0 when a seller ends a stream mid-break and
-- starts a new stream to keep going. No existing columns are touched.

ALTER TABLE "LiveRoom" ADD COLUMN "continuationOfLiveRoomId" TEXT;

CREATE INDEX "LiveRoom_continuationOfLiveRoomId_idx" ON "LiveRoom"("continuationOfLiveRoomId");

ALTER TABLE "LiveRoom"
  ADD CONSTRAINT "LiveRoom_continuationOfLiveRoomId_fkey"
  FOREIGN KEY ("continuationOfLiveRoomId") REFERENCES "LiveRoom"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
