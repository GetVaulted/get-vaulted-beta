import type { ReactNode } from "react";
import Link from "next/link";
import { MarketplaceItemDetailTabs } from "@/components/marketplace/MarketplaceItemDetailTabs";
import { MarketplaceItemGallery } from "@/components/marketplace/MarketplaceItemGallery";
import { MarketplaceItemPurchasePanel } from "@/components/marketplace/MarketplaceItemPurchasePanel";
import { MarketplaceItemSellerSection } from "@/components/marketplace/MarketplaceItemSellerSection";
import { MarketplaceItemStickyBuyBar } from "@/components/marketplace/MarketplaceItemStickyBuyBar";
import { MarketplaceItemTrustVault } from "@/components/marketplace/MarketplaceItemTrustVault";
import { MarketplaceItemConfidenceStrip } from "@/components/marketplace/MarketplaceItemConfidenceStrip";
import { MarketplaceItemRecommendations } from "@/components/marketplace/MarketplaceItemRecommendations";
import { MarketplaceWatchlistToggle } from "@/components/marketplace/MarketplaceWatchlistToggle";
import { ListingLiveRooms } from "@/components/marketplace/ListingLiveRooms";
import {
  getRelatedCollectibleListings,
  getSameSellerListings,
  getSimilarListings,
  type MarketplaceListing,
} from "@/content/marketplace-listings";
import { ExpiredAuctionRecoveryPanel } from "@/components/listings/ExpiredAuctionRecoveryPanel";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import { buildItemTrustMetrics } from "@/lib/marketplace-item-trust";
import type { FulfillmentReadinessIssue } from "@/lib/seller-shipping-readiness";

type MarketplaceItemViewProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
  relatedPool?: MarketplaceListing[];
  expiredAuctionRecoveryListingId?: string;
  sellerFulfillmentWarnings?: FulfillmentReadinessIssue[];
};

function ProductBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "gold" | "sky" | "emerald" | "rose" | "neutral";
}) {
  const tones = {
    gold: "border-gold/30 bg-gold/10 text-gold-bright/90",
    sky: "border-sky-400/30 bg-sky-950/35 text-sky-100/90",
    emerald: "border-emerald-400/25 bg-emerald-950/25 text-emerald-100/90",
    rose: "border-rose-400/30 bg-rose-950/25 text-rose-100/90",
    neutral: "border-white/15 bg-white/[0.06] text-zinc-100",
  };
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function MarketplaceItemView({
  listing,
  extras,
  relatedPool,
  expiredAuctionRecoveryListingId,
  sellerFulfillmentWarnings,
}: MarketplaceItemViewProps) {
  const trustMetrics = buildItemTrustMetrics(listing, extras);
  const similar = getSimilarListings(listing, 4, relatedPool);
  const sameSeller = getSameSellerListings(listing, 4, relatedPool);
  const related = getRelatedCollectibleListings(listing, 4, relatedPool);
  const showLowStock = extras.stockRemaining === 1;
  const showAuthBadge =
    Boolean(extras.authenticationLabel) || Boolean(listing.condition.match(/^(PSA|BGS|SGC)/i));
  const legacyAuction =
    listing.buyingFormat === "auction" &&
    listing.listingStatus != null &&
    (listing.listingStatus === "auction_live" ||
      listing.listingStatus === "awaiting_auction_payment" ||
      listing.listingStatus === "auction_ended_unpaid");

  return (
    <article className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-10">
      <nav className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <Link href="/marketplace" className="text-gold-bright/90 transition hover:text-gold-bright">
          Marketplace
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-zinc-400">{listing.category ?? "Collectibles"}</span>
      </nav>

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
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-12">
        <MarketplaceItemGallery
          seeds={extras.gallerySeeds}
          imageUrls={extras.galleryImageUrls}
          title={listing.title}
        />

        <div className="min-w-0 space-y-5">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {listing.isCompanyListing ? <ProductBadge tone="sky">Official</ProductBadge> : null}
              {showAuthBadge ? <ProductBadge tone="gold">Authenticated</ProductBadge> : null}
              <ProductBadge tone="neutral">{listing.condition}</ProductBadge>
              {!legacyAuction ? <ProductBadge tone="emerald">Available now</ProductBadge> : null}
              {showLowStock ? <ProductBadge tone="rose">Only 1 left</ProductBadge> : null}
              {listing.vaultPick ? <ProductBadge tone="gold">Vault pick</ProductBadge> : null}
            </div>

            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 flex-1 font-display text-2xl font-bold leading-[1.15] tracking-tight text-foreground sm:text-3xl lg:text-[2rem]">
                {listing.title}
              </h1>
              {!legacyAuction ? (
                <MarketplaceWatchlistToggle listingId={listing.id} sellerId={listing.sellerId} variant="title" />
              ) : null}
            </div>

            {!legacyAuction ? (
              <p className="text-sm text-zinc-400">
                <span className="font-semibold tabular-nums text-zinc-200">{extras.watchingCount}</span> watching
                {listing.sellerVerified ? (
                  <>
                    <span className="text-zinc-600"> · </span>
                    <span className="text-zinc-300">Verified seller</span>
                  </>
                ) : null}
              </p>
            ) : null}
          </header>

          <MarketplaceItemTrustVault metrics={trustMetrics} />

          <MarketplaceItemPurchasePanel listing={listing} extras={extras} />

          <MarketplaceItemConfidenceStrip listing={listing} extras={extras} />

          <MarketplaceItemSellerSection listing={listing} extras={extras} trustMetrics={trustMetrics} />

          <div id="item-primary-cta-sentinel" className="h-px w-full scroll-mt-24" aria-hidden />
        </div>
      </div>

      <ListingLiveRooms listingId={listing.id} />

      <MarketplaceItemDetailTabs listing={listing} extras={extras} />

      <MarketplaceItemRecommendations similar={similar} sameSeller={sameSeller} related={related} />

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
