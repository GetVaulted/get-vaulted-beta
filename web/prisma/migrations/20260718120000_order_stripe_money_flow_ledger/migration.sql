-- Stripe money-flow ledger columns on Order (append-only IDs + actual BT fees).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripeTaxTransactionId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripeTaxTransactionReversalId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripeChargeId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripeBalanceTransactionId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripeProcessingFeeCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripeApplicationFeeCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stripeNetCents" INTEGER;

CREATE INDEX IF NOT EXISTS "Order_stripeChargeId_idx" ON "Order"("stripeChargeId");
CREATE INDEX IF NOT EXISTS "Order_stripeBalanceTransactionId_idx" ON "Order"("stripeBalanceTransactionId");
CREATE INDEX IF NOT EXISTS "Order_stripeTaxTransactionId_idx" ON "Order"("stripeTaxTransactionId");
