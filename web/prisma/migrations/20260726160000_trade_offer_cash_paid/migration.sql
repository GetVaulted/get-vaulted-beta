-- On-platform trade cash Checkout (payer = cash adder, payee = other party).
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'cash_paid';

ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "cashPaidAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "cashCheckoutSessionId" TEXT;
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "cashPaymentIntentId" TEXT;
