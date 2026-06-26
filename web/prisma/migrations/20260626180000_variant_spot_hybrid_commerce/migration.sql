-- PYT/PYD hybrid spot commerce: per-pin fixed or auction, with auction scoped to one variant.
CREATE TYPE "LiveVariantSpotCommerceDefault" AS ENUM ('fixed', 'auction', 'hybrid');
CREATE TYPE "LiveActiveSpotCommerceMode" AS ENUM ('fixed', 'auction');

ALTER TABLE "LiveRoomItem"
  ADD COLUMN "variantSpotCommerceDefault" "LiveVariantSpotCommerceDefault" NOT NULL DEFAULT 'hybrid',
  ADD COLUMN "activeSpotCommerceMode" "LiveActiveSpotCommerceMode",
  ADD COLUMN "auctionVariantId" TEXT;

ALTER TABLE "LiveRoomItem"
  ADD CONSTRAINT "LiveRoomItem_auctionVariantId_fkey"
  FOREIGN KEY ("auctionVariantId") REFERENCES "LiveItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LiveRoomItem_auctionVariantId_idx" ON "LiveRoomItem"("auctionVariantId");
