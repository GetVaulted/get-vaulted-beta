import Link from "next/link";
import { MarketplaceBrowseCard } from "@/components/marketplace/MarketplaceBrowseCard";
import { MarketplaceItemDetailTabs } from "@/components/marketplace/MarketplaceItemDetailTabs";
import { MarketplaceItemGallery } from "@/components/marketplace/MarketplaceItemGallery";
import { MarketplaceItemPurchasePanel } from "@/components/marketplace/MarketplaceItemPurchasePanel";
import { MarketplaceItemSellerSection } from "@/components/marketplace/MarketplaceItemSellerSection";
import { MarketplaceItemStickyBuyBar } from "@/components/marketplace/MarketplaceItemStickyBuyBar";
import { MarketplaceWatchlistToggle } from "@/components/marketplace/MarketplaceWatchlistToggle";
import { ListingLiveRooms } from "@/components/marketplace/ListingLiveRooms";
import { getRelatedMarketplaceListings, type MarketplaceListing } from "@/content/marketplace-listings";
import { ExpiredAuctionRecoveryPanel } from "@/components/listings/ExpiredAuctionRecoveryPanel";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import type { FulfillmentReadinessIssue } from "@/lib/seller-shipping-readiness";

type MarketplaceItemViewProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
  /** When provided, “more from this seller” pulls from this pool (e.g. static + user listings). */
  relatedPool?: MarketplaceListing[];
  /** Seller/admin recovery when winner payment expired. */
  expiredAuctionRecoveryListingId?: string;
  /** Owner-only: gaps that block labels or payouts. */
  sellerFulfillmentWarnings?: FulfillmentReadinessIssue[];
};


export function MarketplaceItemView({
  listing,
  extras,
  relatedPool,
  expiredAuctionRecoveryListingId,
  sellerFulfillmentWarnings,
}: MarketplaceItemViewProps) {
  const related = getRelatedMarketplaceListings(listing, 4, relatedPool);
  const showLowStock = extras.stockRemaining === 1;
  const legacyAuction =
    listing.buyingFormat === "auction" &&
    listing.listingStatus != null &&
    (listing.listingStatus === "auction_live" ||
      listing.listingStatus === "awaiting_auction_payment" ||
      listing.listingStatus === "auction_ended_unpaid");

  return (
    <article className="mx-auto w-full max-w-[1400px] px-6 pb-24 pt-5 sm:pt-6 lg:px-10">
      <Link
        href="/marketplace"
        className="inline-flex text-xs font-semibold uppercase tracking-wider text-gold-bright/90 transition hover:text-gold-bright"
      >
        ← Back to marketplace
      </Link>

      {expiredAuctionRecoveryListingId ? (
        <div className="mt-5">
          <ExpiredAuctionRecoveryPanel listingId={expiredAuctionRecoveryListingId} />
        </div>
      ) : null}

      {sellerFulfillmentWarnings && sellerFulfillmentWarnings.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4" role="status">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/90">Shipping readiness</p>
          <ul className="mt-2 space-y-1.5 text-xs text-amber-100/95">
            {sellerFulfillmentWarnings.map((w) => (
              <li key={w.code} className={w.severity === "error" ? "text-rose-200" : undefined}>
                {w.message}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-zinc-500">
            Fix these under <span className="font-semibold text-zinc-400">Account → Seller</span> (address / Stripe) and{" "}
            <span className="font-semibold text-zinc-400">My listings → Edit</span> (parcel size).
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <MarketplaceItemGallery seeds={extras.gallerySeeds} imageUrls={extras.galleryImageUrls} />

        <div className="min-w-0">
          <div className="rounded-2xl border border-white/[0.1] bg-[#09090b]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_48px_-32px_rgba(0,0,0,0.65)] sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {listing.isCompanyListing ? (
                <span className="inline-flex rounded-md border border-sky-400/30 bg-sky-950/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-100/90">
                  Official
                </span>
              ) : null}
              <span className="inline-flex rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-100">
                {listing.condition}
              </span>
              <span className="inline-flex rounded-md border border-emerald-400/25 bg-emerald-950/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-100/90">
                Buy now
              </span>
              {listing.allowOffers ? (
                <span className="inline-flex rounded-md border border-sky-400/25 bg-sky-950/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-100/90">
                  Offers on
                </span>
              ) : null}
              {listing.acceptTradeOffers ? (
                <span className="inline-flex rounded-md border border-amber-400/25 bg-amber-950/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100/90">
                  Trades on
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex items-start justify-between gap-3">
              <h1 className="min-w-0 flex-1 font-display text-xl font-bold leading-snug tracking-tight text-foreground sm:text-2xl">
                {listing.title}
              </h1>
              {!legacyAuction ? (
                <MarketplaceWatchlistToggle listingId={listing.id} sellerId={listing.sellerId} variant="title" />
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-b border-white/[0.08] pb-4 text-xs sm:text-sm">
              {showLowStock ? (
                <span className="font-semibold text-rose-200">Only 1 available</span>
              ) : null}
              {!legacyAuction ? (
                <span className="text-zinc-400">
                  <span className="font-semibold tabular-nums text-zinc-100">{extras.watchingCount}</span> watching
                </span>
              ) : null}
            </div>

            <div className="mt-5">
              <MarketplaceItemPurchasePanel listing={listing} extras={extras} />
            </div>

            <div id="item-primary-cta-sentinel" className="h-px w-full scroll-mt-24" aria-hidden />
          </div>
        </div>
      </div>

      <MarketplaceItemSellerSection listing={listing} extras={extras} />

      <div className="mt-5 rounded-2xl border border-white/[0.1] bg-[#09090b]/80 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-400 sm:gap-x-5">
          <span className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400/90" aria-hidden />
            {extras.shipSpeedLine}
          </span>
          <span className="hidden h-3 w-px bg-white/10 sm:block" aria-hidden />
          <span className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-sky-400/90" aria-hidden />
            Secure checkout
          </span>
          <span className="hidden h-3 w-px bg-white/10 sm:block" aria-hidden />
          <span className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-gold-bright/80" aria-hidden />
            Verified seller
          </span>
        </div>
      </div>

      <ListingLiveRooms listingId={listing.id} />

      <MarketplaceItemDetailTabs listing={listing} extras={extras} />

      {related.length > 0 ? (
        <section className="mt-6 border-t border-white/[0.07] pt-6" aria-labelledby="item-related">
          <h2 id="item-related" className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            More from this seller
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {related.map((l) => (
              <MarketplaceBrowseCard key={l.id} listing={l} emphasizeHover vaultPick={Boolean(l.vaultPick)} compact />
            ))}
          </div>
        </section>
      ) : null}

      {!legacyAuction ? (
        <MarketplaceItemStickyBuyBar
          mode="buy_now"
          buyNowPrice={listing.price}
          auctionCurrentBid={listing.price}
          listingId={listing.id}
          listingTitle={listing.title}
          sellerId={listing.sellerId}
        />
      ) : null}
    </article>
  );
}
