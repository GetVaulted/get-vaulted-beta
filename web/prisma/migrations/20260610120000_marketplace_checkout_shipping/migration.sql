-- Marketplace checkout: persist seller shipping offer rules on listings.
CREATE TYPE "MarketplaceShippingOfferScope" AS ENUM ('all', 'no_overnight', 'custom');

ALTER TABLE "Listing"
ADD COLUMN "marketplaceShippingOfferScope" "MarketplaceShippingOfferScope" NOT NULL DEFAULT 'all',
ADD COLUMN "marketplaceAllowedRateKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
