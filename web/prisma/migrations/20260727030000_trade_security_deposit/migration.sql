-- Refundable security deposits for straight ($0 cash) trades.
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'deposit_paid';
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'deposit_refunded';

ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "proposerDepositPaidAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "recipientDepositPaidAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "proposerDepositCheckoutSessionId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "recipientDepositCheckoutSessionId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "proposerDepositPaymentIntentId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "recipientDepositPaymentIntentId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "proposerDepositRefundedAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "recipientDepositRefundedAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "proposerDepositRefundId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "recipientDepositRefundId" TEXT;
