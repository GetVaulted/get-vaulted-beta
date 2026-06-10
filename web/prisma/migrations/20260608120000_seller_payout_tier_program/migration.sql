-- Seller payout tier program: metrics, tier cache, order payout triggers

CREATE TYPE "SellerPayoutTier" AS ENUM ('standard', 'fast', 'instant');
CREATE TYPE "PayoutTierApprovalStatus" AS ENUM ('not_eligible', 'eligible', 'pending_approval', 'approved', 'denied', 'suspended');
CREATE TYPE "SellerFraudStatus" AS ENUM ('none', 'flagged', 'investigation');

ALTER TYPE "OrderPayoutMethod" ADD VALUE IF NOT EXISTS 'fast_after_acceptance';
ALTER TYPE "OrderPayoutMethod" ADD VALUE IF NOT EXISTS 'instant_after_label';

ALTER TYPE "OrderPayoutStatus" ADD VALUE IF NOT EXISTS 'fast_payout_ready';
ALTER TYPE "OrderPayoutStatus" ADD VALUE IF NOT EXISTS 'label_payout_ready';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "payoutTier" "SellerPayoutTier" NOT NULL DEFAULT 'standard';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fastPayoutStatus" "PayoutTierApprovalStatus" NOT NULL DEFAULT 'not_eligible';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fastPayoutOverrideByAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fastPayoutOverrideReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fastPayoutOverrideAdminId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fastPayoutOverrideAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutApprovalStatus" "PayoutTierApprovalStatus" NOT NULL DEFAULT 'not_eligible';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "payoutTierSuspensionReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "payoutTierSuspendedAt" TIMESTAMP(3);

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "labelCreatedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "carrierAcceptedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "SellerPayoutMetrics" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "lifetimeGmvUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "completedOrders" INTEGER NOT NULL DEFAULT 0,
  "cancelledOrders" INTEGER NOT NULL DEFAULT 0,
  "sellerRating" DOUBLE PRECISION,
  "cancellationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "chargebackRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "disputeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "accountAgeDays" INTEGER NOT NULL DEFAULT 0,
  "fraudStatus" "SellerFraudStatus" NOT NULL DEFAULT 'none',
  "unresolvedDisputeCount" INTEGER NOT NULL DEFAULT 0,
  "excessiveShippingDelayCount" INTEGER NOT NULL DEFAULT 0,
  "lastRecalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerPayoutMetrics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SellerPayoutMetrics_sellerId_key" ON "SellerPayoutMetrics"("sellerId");
CREATE INDEX IF NOT EXISTS "SellerPayoutMetrics_lastRecalculatedAt_idx" ON "SellerPayoutMetrics"("lastRecalculatedAt");

ALTER TABLE "SellerPayoutMetrics" DROP CONSTRAINT IF EXISTS "SellerPayoutMetrics_sellerId_fkey";
ALTER TABLE "SellerPayoutMetrics" ADD CONSTRAINT "SellerPayoutMetrics_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
