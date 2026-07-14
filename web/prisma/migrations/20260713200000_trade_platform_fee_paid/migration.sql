-- Trade platform fee tracking ($2.99 per party) + timeline event.
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'platform_fee_paid';

ALTER TABLE "TradeOffer"
  ADD COLUMN IF NOT EXISTS "proposerPlatformFeePaidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recipientPlatformFeePaidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposerPlatformFeeCheckoutSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientPlatformFeeCheckoutSessionId" TEXT;
