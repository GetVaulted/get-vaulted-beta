-- Trade cash escrow (platform hold) + dispute status.
ALTER TYPE "TradeOfferStatus" ADD VALUE IF NOT EXISTS 'disputed';

ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'dispute_opened';
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'cash_released';
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'cash_refunded';
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'dispute_resolved';

ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "cashReleasedAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "cashTransferId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "cashRefundedAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "cashRefundId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "cashReleaseError" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "disputedAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "disputeOpenedByUserId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "disputeReason" TEXT;
