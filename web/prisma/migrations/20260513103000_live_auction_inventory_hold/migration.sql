-- CreateEnum
CREATE TYPE "LiveAuctionInventoryHoldStatus" AS ENUM ('active', 'consumed', 'released', 'expired');

-- CreateTable
CREATE TABLE "LiveAuctionInventoryHold" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "liveRoomItemId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "LiveAuctionInventoryHoldStatus" NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveAuctionInventoryHold_pkey" PRIMARY KEY ("id")
);

-- ForeignKeys
ALTER TABLE "LiveAuctionInventoryHold" ADD CONSTRAINT "LiveAuctionInventoryHold_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveAuctionInventoryHold" ADD CONSTRAINT "LiveAuctionInventoryHold_liveRoomItemId_fkey" FOREIGN KEY ("liveRoomItemId") REFERENCES "LiveRoomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveAuctionInventoryHold" ADD CONSTRAINT "LiveAuctionInventoryHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveAuctionInventoryHold" ADD CONSTRAINT "LiveAuctionInventoryHold_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Helpful indexes
CREATE INDEX "LiveAuctionInventoryHold_listingId_status_idx" ON "LiveAuctionInventoryHold"("listingId", "status");
CREATE INDEX "LiveAuctionInventoryHold_liveRoomItemId_status_idx" ON "LiveAuctionInventoryHold"("liveRoomItemId", "status");
CREATE INDEX "LiveAuctionInventoryHold_status_expiresAt_idx" ON "LiveAuctionInventoryHold"("status", "expiresAt");
CREATE INDEX "LiveAuctionInventoryHold_userId_listingId_status_idx" ON "LiveAuctionInventoryHold"("userId", "listingId", "status");

-- At most one active reservation per listing (cross-channel oversell prevention)
CREATE UNIQUE INDEX "LiveAuctionInventoryHold_one_active_listing"
ON "LiveAuctionInventoryHold" ("listingId")
WHERE ("listingId" IS NOT NULL AND "status" = 'active');

-- Host-only live row: at most one active hold per live room item when no listing is attached
CREATE UNIQUE INDEX "LiveAuctionInventoryHold_one_active_live_item"
ON "LiveAuctionInventoryHold" ("liveRoomItemId")
WHERE ("listingId" IS NULL AND "liveRoomItemId" IS NOT NULL AND "status" = 'active');
