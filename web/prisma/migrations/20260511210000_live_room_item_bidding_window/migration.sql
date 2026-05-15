-- Timed auction window: host opens bidding with Start; until then lot is "posted" only.
ALTER TABLE "LiveRoomItem" ADD COLUMN "biddingOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LiveRoomItem" ADD COLUMN "auctionEndsAt" TIMESTAMP(3);
