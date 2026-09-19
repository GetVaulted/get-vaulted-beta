-- Trade fulfillment: mark shipped / confirm received → completed.
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'party_shipped';
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'party_received';
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'offer_completed';

ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "proposerShippedAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "recipientShippedAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "proposerReceivedAt" TIMESTAMP(3);
ALTER TABLE "TradeOffer" ADD COLUMN IF NOT EXISTS "recipientReceivedAt" TIMESTAMP(3);
