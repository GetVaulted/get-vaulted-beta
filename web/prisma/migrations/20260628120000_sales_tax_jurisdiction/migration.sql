-- Order tax audit fields
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxJurisdictionState" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxTaxableSubtotalCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxShippingTaxableCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxCalculatedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxRefundedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxCollectionBasis" TEXT;

-- Nexus collection basis
ALTER TABLE "TaxNexusState" ADD COLUMN IF NOT EXISTS "collectionBasis" TEXT NOT NULL DEFAULT 'marketplace_facilitator';

UPDATE "TaxNexusState" SET "collectionBasis" = 'marketplace_facilitator' WHERE "enabled" = true;

-- Destination volume monitoring (informational only)
CREATE TABLE IF NOT EXISTS "TaxDestinationVolumeDaily" (
    "id" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "taxableSalesCents" INTEGER NOT NULL DEFAULT 0,
    "nonTaxableSalesCents" INTEGER NOT NULL DEFAULT 0,
    "taxCollectedCents" INTEGER NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxDestinationVolumeDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaxDestinationVolumeDaily_stateCode_orderDate_key"
  ON "TaxDestinationVolumeDaily"("stateCode", "orderDate");

CREATE INDEX IF NOT EXISTS "TaxDestinationVolumeDaily_stateCode_orderDate_idx"
  ON "TaxDestinationVolumeDaily"("stateCode", "orderDate");
