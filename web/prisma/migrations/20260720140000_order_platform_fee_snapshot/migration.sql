-- Immutable Get Vaulted platform fee snapshot at charge time.
-- Seller UI must read these fields — never reconstruct from stripeApplicationFeeCents
-- or today's admin fee config.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "platformFeeCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "platformFeePercentApplied" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "platformFeeBasisCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "platformFeePriorShowGmvUsd" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "platformFeeSellerOverrideApplied" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Order_platformFeeCents_idx" ON "Order"("platformFeeCents");
