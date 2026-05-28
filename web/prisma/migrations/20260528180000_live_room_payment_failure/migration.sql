-- Live room payment failure lockout (buyer must recover before bidding/buying again in-room).

CREATE TYPE "LiveRoomPaymentFailureStatus" AS ENUM ('payment_failed', 'recovery_pending', 'paid');

CREATE TYPE "LiveRoomPaymentFailureKind" AS ENUM ('auction_win', 'buy_now', 'break_spot', 'variant_purchase');

CREATE TABLE "LiveRoomPaymentFailure" (
    "id" TEXT NOT NULL,
    "liveRoomId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "kind" "LiveRoomPaymentFailureKind" NOT NULL,
    "liveRoomItemId" TEXT,
    "orderId" TEXT,
    "variantPurchaseId" TEXT,
    "breakSpotId" TEXT,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "status" "LiveRoomPaymentFailureStatus" NOT NULL DEFAULT 'payment_failed',
    "failureReason" TEXT,
    "buyerUsername" TEXT,
    "itemTitle" TEXT,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveRoomPaymentFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LiveRoomPaymentFailure_liveRoomId_buyerId_status_idx" ON "LiveRoomPaymentFailure"("liveRoomId", "buyerId", "status");
CREATE INDEX "LiveRoomPaymentFailure_liveRoomId_status_idx" ON "LiveRoomPaymentFailure"("liveRoomId", "status");
CREATE INDEX "LiveRoomPaymentFailure_buyerId_status_idx" ON "LiveRoomPaymentFailure"("buyerId", "status");

ALTER TABLE "LiveRoomPaymentFailure" ADD CONSTRAINT "LiveRoomPaymentFailure_liveRoomId_fkey" FOREIGN KEY ("liveRoomId") REFERENCES "LiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveRoomPaymentFailure" ADD CONSTRAINT "LiveRoomPaymentFailure_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
