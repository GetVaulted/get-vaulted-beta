-- Live-show capped shipping: seller profiles, shipping mode, carrier preference, terms snapshots.

CREATE TYPE "LiveShowShippingMode" AS ENUM ('calculated', 'capped', 'free');
CREATE TYPE "LiveShowCarrierPreference" AS ENUM ('usps', 'ups', 'best_rate');

CREATE TABLE "SellerShippingProfile" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "sourceSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultWeightOz" DOUBLE PRECISION NOT NULL,
    "defaultLengthIn" DOUBLE PRECISION NOT NULL,
    "defaultWidthIn" DOUBLE PRECISION NOT NULL,
    "defaultHeightIn" DOUBLE PRECISION NOT NULL,
    "packageType" TEXT NOT NULL DEFAULT '',
    "bundleGroup" TEXT NOT NULL DEFAULT 'general',
    "incrementalWeightOz" DOUBLE PRECISION,
    "maxUnitsPerParcel" INTEGER,
    "requiresSeparatePackage" BOOLEAN NOT NULL DEFAULT false,
    "canJoinBuyerShowShipment" BOOLEAN NOT NULL DEFAULT true,
    "carrierPreference" "LiveShowCarrierPreference" NOT NULL DEFAULT 'best_rate',
    "defaultServicePreference" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerShippingProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerShippingProfile_sellerId_sourceSlug_key" ON "SellerShippingProfile"("sellerId", "sourceSlug");
CREATE INDEX "SellerShippingProfile_sellerId_archivedAt_idx" ON "SellerShippingProfile"("sellerId", "archivedAt");

ALTER TABLE "SellerShippingProfile" ADD CONSTRAINT "SellerShippingProfile_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveRoom" ADD COLUMN "shippingMode" "LiveShowShippingMode" NOT NULL DEFAULT 'capped';
ALTER TABLE "LiveRoom" ADD COLUMN "carrierPreference" "LiveShowCarrierPreference" NOT NULL DEFAULT 'best_rate';
ALTER TABLE "LiveRoom" ADD COLUMN "bundleEligiblePurchases" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LiveRoom" ADD COLUMN "shippingTermsVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "LiveRoom" ADD COLUMN "defaultSellerShippingProfileId" TEXT;

ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_defaultSellerShippingProfileId_fkey" FOREIGN KEY ("defaultSellerShippingProfileId") REFERENCES "SellerShippingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LiveRoomItem" ADD COLUMN "sellerShippingProfileId" TEXT;
ALTER TABLE "LiveRoomItem" ADD CONSTRAINT "LiveRoomItem_sellerShippingProfileId_fkey" FOREIGN KEY ("sellerShippingProfileId") REFERENCES "SellerShippingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LiveShippingSession" ADD COLUMN "shippingMode" "LiveShowShippingMode";
ALTER TABLE "LiveShippingSession" ADD COLUMN "shippingChargedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LiveShippingSession" ADD COLUMN "estimatedEligibleShippingCents" INTEGER;
ALTER TABLE "LiveShippingSession" ADD COLUMN "finalLabelCostCents" INTEGER;
ALTER TABLE "LiveShippingSession" ADD COLUMN "carrierPreference" "LiveShowCarrierPreference";
ALTER TABLE "LiveShippingSession" ADD COLUMN "shippingTermsVersion" INTEGER;

ALTER TABLE "Order" ADD COLUMN "shippingTermsSnapshotJson" JSONB;
ALTER TABLE "Order" ADD COLUMN "shippingTermsVersion" INTEGER;

-- Backfill booleans from new mode column for existing rows.
UPDATE "LiveRoom" SET "shippingMode" = 'free' WHERE "freeShippingEnabled" = true;
UPDATE "LiveRoom" SET "shippingMode" = 'capped' WHERE "freeShippingEnabled" = false AND "shippingCapEnabled" = true;
UPDATE "LiveRoom" SET "shippingMode" = 'calculated' WHERE "freeShippingEnabled" = false AND "shippingCapEnabled" = false;

UPDATE "LiveRoom" SET "shippingCapCents" = 999
WHERE "shippingCapEnabled" = true AND ("shippingCapCents" IS NULL OR "shippingCapCents" = 1199);

UPDATE "LiveShippingSession" SET "shippingChargedCents" = "shippingCostCents" WHERE "shippingChargedCents" = 0 AND "shippingCostCents" > 0;
