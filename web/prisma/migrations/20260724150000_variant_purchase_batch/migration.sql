-- Multi-spot break checkout: one Order / one PaymentIntent can cover N variant purchases.
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

DROP INDEX IF EXISTS "LiveItemVariantPurchase_fulfillmentOrderId_key";
CREATE INDEX IF NOT EXISTS "LiveItemVariantPurchase_fulfillmentOrderId_idx" ON "LiveItemVariantPurchase"("fulfillmentOrderId");
CREATE INDEX IF NOT EXISTS "LiveItemVariantPurchase_batchId_idx" ON "LiveItemVariantPurchase"("batchId");
