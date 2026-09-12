-- Combined trade checkout: platform fee + outbound Shippo label per party.
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'shipping_label_purchased';
ALTER TYPE "TradeOfferEventType" ADD VALUE IF NOT EXISTS 'shipping_label_failed';

ALTER TABLE "TradeOffer"
  ADD COLUMN IF NOT EXISTS "proposerShippingChargedCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "recipientShippingChargedCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "proposerShippoShipmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientShippoShipmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "proposerShippoRateObjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientShippoRateObjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "proposerShippoTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientShippoTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "proposerLabelUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientLabelUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "proposerTrackingNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientTrackingNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "proposerTrackingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientTrackingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "proposerLabelPurchasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recipientLabelPurchasedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposerLabelErrorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientLabelErrorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "shippingWeightTier" TEXT;
