-- Unified shipping profiles across Live, Marketplace, and Trade.

CREATE TABLE "PlatformShippingProfile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultWeightOz" DOUBLE PRECISION NOT NULL,
    "defaultLengthIn" DOUBLE PRECISION NOT NULL,
    "defaultWidthIn" DOUBLE PRECISION NOT NULL,
    "defaultHeightIn" DOUBLE PRECISION NOT NULL,
    "packageType" TEXT NOT NULL DEFAULT '',
    "bundleAllowed" BOOLEAN NOT NULL DEFAULT true,
    "requiresSeparatePackage" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformShippingProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformShippingProfile_slug_key" ON "PlatformShippingProfile"("slug");
CREATE INDEX "PlatformShippingProfile_isActive_sortOrder_idx" ON "PlatformShippingProfile"("isActive", "sortOrder");

CREATE TYPE "ShipmentPackageStatus" AS ENUM ('estimated', 'label_created', 'voided');

CREATE TABLE "ShipmentPackage" (
    "id" TEXT NOT NULL,
    "liveShippingSessionId" TEXT,
    "orderId" TEXT,
    "packageIndex" INTEGER NOT NULL DEFAULT 0,
    "weightOz" DOUBLE PRECISION NOT NULL,
    "lengthIn" DOUBLE PRECISION NOT NULL,
    "widthIn" DOUBLE PRECISION NOT NULL,
    "heightIn" DOUBLE PRECISION NOT NULL,
    "shippoShipmentId" TEXT,
    "shippoRateId" TEXT,
    "shippoTransactionId" TEXT,
    "carrier" TEXT,
    "serviceLevel" TEXT,
    "trackingNumber" TEXT,
    "labelUrl" TEXT,
    "labelCostCents" INTEGER,
    "status" "ShipmentPackageStatus" NOT NULL DEFAULT 'estimated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentPackage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipmentPackage_liveShippingSessionId_packageIndex_idx" ON "ShipmentPackage"("liveShippingSessionId", "packageIndex");
CREATE INDEX "ShipmentPackage_orderId_idx" ON "ShipmentPackage"("orderId");

ALTER TABLE "ShipmentPackage" ADD CONSTRAINT "ShipmentPackage_liveShippingSessionId_fkey" FOREIGN KEY ("liveShippingSessionId") REFERENCES "LiveShippingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipmentPackage" ADD CONSTRAINT "ShipmentPackage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LiveRoom show-level shipping
ALTER TABLE "LiveRoom" ADD COLUMN "defaultShippingProfileId" TEXT;
ALTER TABLE "LiveRoom" ADD COLUMN "shippingCapEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LiveRoom" ADD COLUMN "shippingCapCents" INTEGER;
ALTER TABLE "LiveRoom" ADD COLUMN "freeShippingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LiveRoom" ADD COLUMN "sellerPaysOverCap" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LiveRoom" ADD CONSTRAINT "LiveRoom_defaultShippingProfileId_fkey" FOREIGN KEY ("defaultShippingProfileId") REFERENCES "PlatformShippingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LiveRoomItem profile inheritance
ALTER TABLE "LiveRoomItem" ADD COLUMN "shippingProfileId" TEXT;
ALTER TABLE "LiveRoomItem" ADD COLUMN "customWeightOz" DOUBLE PRECISION;
ALTER TABLE "LiveRoomItem" ADD COLUMN "customLengthIn" DOUBLE PRECISION;
ALTER TABLE "LiveRoomItem" ADD COLUMN "customWidthIn" DOUBLE PRECISION;
ALTER TABLE "LiveRoomItem" ADD COLUMN "customHeightIn" DOUBLE PRECISION;
ALTER TABLE "LiveRoomItem" ADD COLUMN "requiresSeparatePackage" BOOLEAN;
ALTER TABLE "LiveRoomItem" ADD COLUMN "shippingProfileSnapshotJson" TEXT;

ALTER TABLE "LiveRoomItem" ADD CONSTRAINT "LiveRoomItem_shippingProfileId_fkey" FOREIGN KEY ("shippingProfileId") REFERENCES "PlatformShippingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LiveShippingSession liability snapshots
ALTER TABLE "LiveShippingSession" ADD COLUMN "shippingCapCents" INTEGER;
ALTER TABLE "LiveShippingSession" ADD COLUMN "freeShippingApplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LiveShippingSession" ADD COLUMN "estimatedLabelCostCents" INTEGER;
ALTER TABLE "LiveShippingSession" ADD COLUMN "sellerShippingSubsidyCents" INTEGER NOT NULL DEFAULT 0;

-- Order shipping liability
ALTER TABLE "Order" ADD COLUMN "sellerShippingSubsidyCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "shippingCapApplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "freeShippingApplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "estimatedLabelCostCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN "shippoRateId" TEXT;

-- Listing platform profile
ALTER TABLE "Listing" ADD COLUMN "platformShippingProfileId" TEXT;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_platformShippingProfileId_fkey" FOREIGN KEY ("platformShippingProfileId") REFERENCES "PlatformShippingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
