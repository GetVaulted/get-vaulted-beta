-- Surprise Set auctions: one row per won unit; the random item is drawn when the order is paid.
CREATE TABLE IF NOT EXISTS "SurpriseAuctionDraw" (
    "id" TEXT NOT NULL,
    "liveRoomItemId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "revealedLabel" TEXT,
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurpriseAuctionDraw_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SurpriseAuctionDraw_orderId_key" ON "SurpriseAuctionDraw"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "SurpriseAuctionDraw_liveRoomItemId_revealedLabel_key" ON "SurpriseAuctionDraw"("liveRoomItemId", "revealedLabel");
CREATE INDEX IF NOT EXISTS "SurpriseAuctionDraw_buyerId_createdAt_idx" ON "SurpriseAuctionDraw"("buyerId", "createdAt");

ALTER TABLE "SurpriseAuctionDraw" ADD CONSTRAINT "SurpriseAuctionDraw_liveRoomItemId_fkey" FOREIGN KEY ("liveRoomItemId") REFERENCES "LiveRoomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurpriseAuctionDraw" ADD CONSTRAINT "SurpriseAuctionDraw_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurpriseAuctionDraw" ADD CONSTRAINT "SurpriseAuctionDraw_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only table: RLS on with no policies (PostgREST clients can't read/write; Prisma bypasses).
ALTER TABLE "SurpriseAuctionDraw" ENABLE ROW LEVEL SECURITY;
