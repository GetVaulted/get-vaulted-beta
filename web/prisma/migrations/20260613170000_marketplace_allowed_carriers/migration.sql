-- Seller-selected carriers buyers may choose at checkout (e.g. usps, ups, fedex).
ALTER TABLE "Listing"
ADD COLUMN "marketplaceAllowedCarriers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
