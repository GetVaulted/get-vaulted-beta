-- Performance audit (2026-07): add missing indexes on hot query paths.
-- Listing, Bid, and Order previously had little/no indexing beyond primary keys and a
-- couple of narrow composites, forcing full sequential scans on the marketplace browse
-- feed, seller/admin dashboards, bid placement, and buyer/seller order history.

-- Public marketplace browse/search filters by status(+buyingFormat) and orders by createdAt.
CREATE INDEX IF NOT EXISTS "Listing_status_buyingFormat_createdAt_idx" ON "Listing"("status", "buyingFormat", "createdAt");
-- Seller "my listings" (Seller HQ) filters by sellerId and orders by updatedAt.
CREATE INDEX IF NOT EXISTS "Listing_sellerId_updatedAt_idx" ON "Listing"("sellerId", "updatedAt");
-- Admin listings dashboard filters by status and orders by updatedAt.
CREATE INDEX IF NOT EXISTS "Listing_status_updatedAt_idx" ON "Listing"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "Listing_category_idx" ON "Listing"("category");

-- Bid placement / proxy-bid resolution reads all bids for a listing ordered by time.
CREATE INDEX IF NOT EXISTS "Bid_listingId_createdAt_idx" ON "Bid"("listingId", "createdAt");
CREATE INDEX IF NOT EXISTS "Bid_bidderId_createdAt_idx" ON "Bid"("bidderId", "createdAt");

-- Buyer order history ("My Orders").
CREATE INDEX IF NOT EXISTS "Order_buyerId_createdAt_idx" ON "Order"("buyerId", "createdAt");
-- Seller sales history, in addition to the existing (sellerId, payoutStatus) index.
CREATE INDEX IF NOT EXISTS "Order_sellerId_createdAt_idx" ON "Order"("sellerId", "createdAt");
-- Admin orders dashboard + fulfillment/finance summaries filter by status.
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
-- processAuctionPaymentExpiries scans unpaid orders past their payment deadline.
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_paymentDeadlineAt_idx" ON "Order"("paymentStatus", "paymentDeadlineAt");
