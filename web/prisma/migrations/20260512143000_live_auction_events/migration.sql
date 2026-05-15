-- Canonical auction event stream + idempotency keys for live bid POST.

ALTER TABLE "LiveRoom" ADD COLUMN "auctionEventSeq" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LiveAuctionEvent" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "itemId" TEXT,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveAuctionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveAuctionEvent_liveRoomId_seq_key" ON "LiveAuctionEvent"("liveRoomId", "seq");
CREATE INDEX "LiveAuctionEvent_liveRoomId_publishedAt_seq_idx" ON "LiveAuctionEvent"("liveRoomId", "publishedAt", "seq");

ALTER TABLE "LiveAuctionEvent" ADD CONSTRAINT "LiveAuctionEvent_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LiveBidIdempotency" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveBidIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveBidIdempotency_userId_liveRoomId_itemId_key_key" ON "LiveBidIdempotency"("userId", "liveRoomId", "itemId", "key");
CREATE INDEX "LiveBidIdempotency_createdAt_idx" ON "LiveBidIdempotency"("createdAt");
