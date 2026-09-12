-- CreateEnum
CREATE TYPE "OffPlatformSettlementMethod" AS ENUM ('venmo', 'paypal', 'cash_app', 'cash', 'zelle', 'other');

-- CreateEnum
CREATE TYPE "OffPlatformZeroReason" AS ENUM ('giveaway', 'comp', 'mistake', 'other');

-- CreateEnum
CREATE TYPE "OffPlatformPlatformFeeStatus" AS ENUM ('unpaid', 'paid', 'waived');

-- AlterTable
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "settlementChannel" TEXT;
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "offPlatformMethod" "OffPlatformSettlementMethod";
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "offPlatformZeroReason" "OffPlatformZeroReason";
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "offPlatformNote" TEXT;
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "platformFeeCents" INTEGER;
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "platformFeePercent" DOUBLE PRECISION;
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "platformFeeStatus" "OffPlatformPlatformFeeStatus";
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "platformFeePaidAt" TIMESTAMP(3);
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "platformFeeCheckoutSessionId" TEXT;
ALTER TABLE "LiveItemVariantPurchase" ADD COLUMN IF NOT EXISTS "platformFeePaymentIntentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveItemVariantPurchase_platformFeeStatus_createdAt_idx" ON "LiveItemVariantPurchase"("platformFeeStatus", "createdAt");
