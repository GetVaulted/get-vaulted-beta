-- CreateEnum
CREATE TYPE "OrderRefundRequestKind" AS ENUM ('cancel', 'return');

-- CreateEnum
CREATE TYPE "OrderRefundRequestStatus" AS ENUM (
  'pending_seller',
  'seller_denied',
  'escalated',
  'awaiting_return',
  'return_in_transit',
  'support_denied',
  'refunded'
);

-- CreateTable
CREATE TABLE "OrderRefundRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderRefundRequestKind" NOT NULL,
    "status" "OrderRefundRequestStatus" NOT NULL DEFAULT 'pending_seller',
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sellerDenyReason" TEXT,
    "supportNote" TEXT,
    "returnTrackingNumber" TEXT,
    "returnCarrier" TEXT,
    "sellerDirect" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "sellerRespondedAt" TIMESTAMP(3),
    "supportResolvedAt" TIMESTAMP(3),
    "returnReceivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "stripeRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderRefundRequest_orderId_createdAt_idx" ON "OrderRefundRequest"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderRefundRequest_sellerId_status_idx" ON "OrderRefundRequest"("sellerId", "status");

-- CreateIndex
CREATE INDEX "OrderRefundRequest_buyerId_status_idx" ON "OrderRefundRequest"("buyerId", "status");

-- CreateIndex
CREATE INDEX "OrderRefundRequest_status_escalatedAt_idx" ON "OrderRefundRequest"("status", "escalatedAt");

-- AddForeignKey
ALTER TABLE "OrderRefundRequest" ADD CONSTRAINT "OrderRefundRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefundRequest" ADD CONSTRAINT "OrderRefundRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefundRequest" ADD CONSTRAINT "OrderRefundRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
