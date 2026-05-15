-- CreateTable
CREATE TABLE "LiveAuctionProxyBid" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "liveRoomItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxAmountUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveAuctionProxyBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveAuctionProxyBid_liveRoomItemId_userId_key" ON "LiveAuctionProxyBid"("liveRoomItemId", "userId");

-- CreateIndex
CREATE INDEX "LiveAuctionProxyBid_liveRoomItemId_idx" ON "LiveAuctionProxyBid"("liveRoomItemId");

-- AddForeignKey
ALTER TABLE "LiveAuctionProxyBid" ADD CONSTRAINT "LiveAuctionProxyBid_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAuctionProxyBid" ADD CONSTRAINT "LiveAuctionProxyBid_liveRoomItemId_fkey" FOREIGN KEY ("liveRoomItemId") REFERENCES "LiveRoomItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAuctionProxyBid" ADD CONSTRAINT "LiveAuctionProxyBid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
