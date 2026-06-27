-- Link variant/break purchases to fulfillment orders for capped live shipping ledger + snapshots.
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "fulfillmentOrderId" TEXT;
ALTER TABLE "BreakSpot" ADD COLUMN IF NOT EXISTS "fulfillmentOrderId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "LiveItemVariantPurchase_fulfillmentOrderId_key"
  ON "LiveItemVariantPurchase"("fulfillmentOrderId")
  WHERE "fulfillmentOrderId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "BreakSpot_fulfillmentOrderId_key"
  ON "BreakSpot"("fulfillmentOrderId")
  WHERE "fulfillmentOrderId" IS NOT NULL;

ALTER TABLE "LiveItemVariantPurchase"
  ADD CONSTRAINT "LiveItemVariantPurchase_fulfillmentOrderId_fkey"
  FOREIGN KEY ("fulfillmentOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BreakSpot"
  ADD CONSTRAINT "BreakSpot_fulfillmentOrderId_fkey"
  FOREIGN KEY ("fulfillmentOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
