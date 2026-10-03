-- AlterTable Order: automatic top-up funding when buyer credit exceeds what the platform fee
-- can absorb, so the seller still receives full sale price.
ALTER TABLE "Order" ADD COLUMN "sellerCreditShortfallCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN "sellerCreditShortfallTransferId" TEXT;
ALTER TABLE "Order" ADD COLUMN "sellerCreditShortfallFundedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "sellerCreditShortfallFailedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "sellerCreditShortfallFailureDetail" TEXT;
ALTER TABLE "Order" ADD COLUMN "sellerCreditShortfallIdempotencyKey" TEXT;
