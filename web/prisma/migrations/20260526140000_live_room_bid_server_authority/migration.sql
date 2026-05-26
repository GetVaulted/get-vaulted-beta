-- Server-authoritative accepted bids for host lots (listing lots use marketplace `Bid` rows).
CREATE TABLE "LiveRoomBid" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "liveRoomItemId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "auctionEventSeq" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveRoomBid_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LiveRoomBid_liveRoomItemId_acceptedAt_idx" ON "LiveRoomBid"("liveRoomItemId", "acceptedAt");
CREATE INDEX "LiveRoomBid_liveRoomId_acceptedAt_idx" ON "LiveRoomBid"("liveRoomId", "acceptedAt");
CREATE INDEX "LiveRoomBid_bidderId_acceptedAt_idx" ON "LiveRoomBid"("bidderId", "acceptedAt");

CREATE UNIQUE INDEX "LiveRoomBid_liveRoomItemId_idempotencyKey_key"
  ON "LiveRoomBid"("liveRoomItemId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

ALTER TABLE "LiveRoomBid" ADD CONSTRAINT "LiveRoomBid_liveRoomId_fkey"
  FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveRoomBid" ADD CONSTRAINT "LiveRoomBid_liveRoomItemId_fkey"
  FOREIGN KEY ("liveRoomItemId") REFERENCES "LiveRoomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveRoomBid" ADD CONSTRAINT "LiveRoomBid_bidderId_fkey"
  FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
