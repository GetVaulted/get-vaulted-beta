-- Per-seller platform fee override for launch promos and admin adjustments.
ALTER TABLE "User" ADD COLUMN "sellerPlatformFeePercentOverride" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "sellerPlatformFeeOverrideReason" TEXT;
ALTER TABLE "User" ADD COLUMN "sellerPlatformFeeOverrideAdminId" TEXT;
ALTER TABLE "User" ADD COLUMN "sellerPlatformFeeOverrideAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "sellerPlatformFeeOverrideExpiresAt" TIMESTAMP(3);
