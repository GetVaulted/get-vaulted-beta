-- Payout risk controls: approval workflow, account standing, seller levels, instant limits

CREATE TYPE "InstantPayoutApprovalStatus" AS ENUM ('not_eligible', 'eligible', 'under_review', 'approved', 'suspended');
CREATE TYPE "AccountStanding" AS ENUM ('excellent', 'good', 'needs_attention', 'restricted');
CREATE TYPE "SellerLevel" AS ENUM ('vault_seller', 'trusted_seller', 'vault_verified', 'elite_vault_verified');

-- Migrate instant approval workflow off PayoutTierApprovalStatus
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutApprovalStatusNew" "InstantPayoutApprovalStatus" NOT NULL DEFAULT 'not_eligible';

UPDATE "User" SET "instantPayoutApprovalStatusNew" = CASE
  WHEN "instantPayoutApprovalStatus"::text = 'approved' THEN 'approved'::"InstantPayoutApprovalStatus"
  WHEN "instantPayoutApprovalStatus"::text = 'pending_approval' THEN 'under_review'::"InstantPayoutApprovalStatus"
  WHEN "instantPayoutApprovalStatus"::text = 'eligible' THEN 'eligible'::"InstantPayoutApprovalStatus"
  WHEN "instantPayoutApprovalStatus"::text = 'suspended' THEN 'suspended'::"InstantPayoutApprovalStatus"
  ELSE 'not_eligible'::"InstantPayoutApprovalStatus"
END
WHERE "instantPayoutApprovalStatus" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN IF EXISTS "instantPayoutApprovalStatus";
ALTER TABLE "User" RENAME COLUMN "instantPayoutApprovalStatusNew" TO "instantPayoutApprovalStatus";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutReviewDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutReviewedById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutReviewNotes" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutRejectionReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerLevel" "SellerLevel" NOT NULL DEFAULT 'vault_seller';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerLevelOverrideByAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerLevelOverrideAdminId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sellerLevelOverrideAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutPerOrderLimitUsd" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutDailyLimitUsd" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instantPayoutExposureLimitUsd" DOUBLE PRECISION;

ALTER TABLE "SellerPayoutMetrics" ADD COLUMN IF NOT EXISTS "accountStanding" "AccountStanding" NOT NULL DEFAULT 'good';
ALTER TABLE "SellerPayoutMetrics" ADD COLUMN IF NOT EXISTS "trackingComplianceRate" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "SellerPayoutMetrics" ADD COLUMN IF NOT EXISTS "dailyInstantPayoutUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SellerPayoutMetrics" ADD COLUMN IF NOT EXISTS "dailyInstantPayoutResetAt" TIMESTAMP(3);
ALTER TABLE "SellerPayoutMetrics" ADD COLUMN IF NOT EXISTS "outstandingInstantPayoutUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SellerPayoutMetrics" ADD COLUMN IF NOT EXISTS "lifetimeInstantPayoutUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "SellerPayoutMetrics" DROP COLUMN IF EXISTS "sellerRating";
