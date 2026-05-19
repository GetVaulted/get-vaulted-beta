-- Seller end listing + admin-reviewed auction end requests
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'ended';

CREATE TYPE "ListingEndRequestStatus" AS ENUM ('pending', 'approved', 'denied', 'canceled_by_seller');
CREATE TYPE "ListingEndReasonCategory" AS ENUM (
  'item_damaged',
  'listing_mistake',
  'inventory_unavailable',
  'suspected_fraud',
  'shipping_issue',
  'other'
);

CREATE TABLE "ListingEndRequest" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "status" "ListingEndRequestStatus" NOT NULL DEFAULT 'pending',
  "reasonCategory" "ListingEndReasonCategory" NOT NULL,
  "reasonText" TEXT NOT NULL,
  "adminNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  CONSTRAINT "ListingEndRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ListingEndAuditLog" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "listingEndRequestId" TEXT,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingEndAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingEndRequest_listingId_status_createdAt_idx" ON "ListingEndRequest"("listingId", "status", "createdAt");
CREATE INDEX "ListingEndRequest_sellerId_createdAt_idx" ON "ListingEndRequest"("sellerId", "createdAt");
CREATE INDEX "ListingEndAuditLog_listingId_createdAt_idx" ON "ListingEndAuditLog"("listingId", "createdAt");

ALTER TABLE "ListingEndRequest" ADD CONSTRAINT "ListingEndRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingEndRequest" ADD CONSTRAINT "ListingEndRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingEndRequest" ADD CONSTRAINT "ListingEndRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ListingEndAuditLog" ADD CONSTRAINT "ListingEndAuditLog_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingEndAuditLog" ADD CONSTRAINT "ListingEndAuditLog_listingEndRequestId_fkey" FOREIGN KEY ("listingEndRequestId") REFERENCES "ListingEndRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
