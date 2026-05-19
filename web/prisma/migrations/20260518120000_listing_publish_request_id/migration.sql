-- Idempotent marketplace publish from mobile (client publishRequestId).
ALTER TABLE "Listing" ADD COLUMN "publishRequestId" TEXT;

CREATE UNIQUE INDEX "Listing_publishRequestId_key" ON "Listing"("publishRequestId");
