"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { LAYAWAY_MIN_LISTING_PRICE_USD } from "@/lib/layaway/constants";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import { isLegacyMarketplaceTimedAuction } from "@/lib/marketplace-commerce-policy";
import { MarketplaceMakeOfferModal } from "@/components/marketplace/MarketplaceMakeOfferModal";
import { MarketplaceItemShippingEstimateLine } from "@/components/marketplace/MarketplaceItemShippingEstimateLine";

import { formatMarketplaceUsd, marketplaceListingPriceLabel } from "@/lib/format-marketplace-usd";
function OfferIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8h8M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M12 4H4l2-2M4 12h8l-2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type MarketplaceItemPurchasePanelProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
  part?: "all" | "price" | "actions";
};

export function MarketplaceItemPurchasePanel({
  listing,
  extras,
  part = "all",
}: MarketplaceItemPurchasePanelProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [offerOpen, setOfferOpen] = useState(false);
  const [buyerLayawayBlocked, setBuyerLayawayBlocked] = useState<string | null>(null);
  const allowOffers = listing.allowOffers === true;
  const allowLayaway =
    listing.allowLayaway === true &&
    listing.buyingFormat === "buy_now" &&
    listing.price >= LAYAWAY_MIN_LISTING_PRICE_USD;
  const allowTrades = listing.acceptTradeOffers === true;
  const tradeOnly = listing.tradeOnly === true;
  const isOwnListing = Boolean(session?.user?.id && listing.sellerId && session.user.id === listing.sellerId);
  const legacyAuction =
    listing.buyingFormat === "auction" &&
    listing.listingStatus != null &&
    isLegacyMarketplaceTimedAuction({
      buyingFormat: "auction",
      status: listing.listingStatus,
    });
  const listingIsActive = listing.listingStatus === "active";
  const listingUnavailable =
    legacyAuction ||
    listing.listingStatus === "sold" ||
    listing.listingStatus === "awaiting_auction_payment" ||
    listing.listingStatus === "auction_ended_unpaid" ||
    listing.listingStatus === "ended" ||
    listing.listingStatus === "auction_live" ||
    listing.listingStatus === "layaway_reserved";
  const checkoutHref = `/checkout/${encodeURIComponent(listing.id)}`;
  const layawayHref = `/checkout/${encodeURIComponent(listing.id)}?mode=layaway`;

  useEffect(() => {
    if (!session?.user?.id || !allowLayaway) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/account/layaway-status", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = (await res.json()) as { hasActiveLayaway?: boolean };
      if (j.hasActiveLayaway) {
        setBuyerLayawayBlocked("You already have an active layaway. Complete or default it before starting another.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, allowLayaway]);

  const askingLines = useMemo(
    () => [{ label: "Asking price", value: formatMarketplaceUsd(listing.price) }],
    [listing.price],
  );

  const handleOfferSubmit = async (amountUsd: number, message: string) => {
    const res = await fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: listing.id, amountUsd, message }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Offer could not be sent.");
    }
    window.dispatchEvent(new Event("gv-offers-updated"));
  };

  const openOfferModal = () => {
    if (!session?.user?.id) {
      const ret = pathname || listing.href || `/marketplace/${encodeURIComponent(listing.id)}`;
      router.push(`/signin?returnTo=${encodeURIComponent(ret)}`);
      return;
    }
    setOfferOpen(true);
  };

  const showMakeOffer = allowOffers && !isOwnListing && listingIsActive && !listingUnavailable;
  const showTradeButton = allowTrades && listingIsActive && !listingUnavailable && !isOwnListing;

  if (listingUnavailable) {
    if (part === "price") return null;
    const statusMessage =
      listing.listingStatus === "sold"
        ? "This item has sold."
        : listing.listingStatus === "layaway_reserved"
          ? "Reserved on layaway — not available for purchase."
          : legacyAuction
            ? "This listing is no longer available in the marketplace. Auctions now run only during Live Shows."
            : "This listing is not available for purchase right now.";
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">{statusMessage}</p>
        <Link href="/marketplace" className="text-sm font-semibold text-gold-bright hover:underline">
          Browse marketplace
        </Link>
      </div>
    );
  }

  const priceBlock = (
    <div className="space-y-1">
      <p className="font-mono text-4xl font-black tracking-tight text-gold-bright sm:text-[2.75rem]">
        {tradeOnly ? "Trade only" : formatMarketplaceUsd(listing.price)}
      </p>
      {tradeOnly ? (
        <p className="text-xs font-medium text-zinc-400">This listing is trade-only — not for sale at the listed price.</p>
      ) : (
        <MarketplaceItemShippingEstimateLine
          listingId={listing.id}
          flatShippingUsd={listing.shippingPriceUsd}
          handlingEstimate={extras.handlingEstimateDisplay}
        />
      )}
      {allowLayaway && !tradeOnly ? (
        <p className="text-xs font-medium text-gold-bright/80">Layaway available — 25% deposit to reserve</p>
      ) : null}
    </div>
  );

  const actionsBlock = (
    <>
      <div className={part === "all" ? "pt-4" : undefined}>
        {isOwnListing ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-zinc-400">
            {tradeOnly ? "This is your trade-only listing — collectors can send trade offers here." : "This is your listing — buyers will use Buy now here."}
          </p>
        ) : tradeOnly ? (
          <Link
            href={`/trade/new?listingId=${encodeURIComponent(listing.id)}`}
            className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-bright px-6 text-base font-bold text-zinc-950 shadow-[0_0_32px_-8px_rgba(201,162,39,0.55)] transition hover:brightness-110 active:scale-[0.995]"
          >
            <TradeIcon />
            Send trade offer
          </Link>
        ) : (
          <>
            <Link
              id="checkout"
              href={checkoutHref}
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-bright px-6 text-base font-bold text-zinc-950 shadow-[0_0_32px_-8px_rgba(201,162,39,0.55)] transition hover:brightness-110 active:scale-[0.995]"
            >
              <svg className="size-5" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2 3h2l1.2 6.4a1 1 0 001 .8h5.6a1 1 0 00.98-.8L13 5H5"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Buy now — {formatMarketplaceUsd(listing.price)}
            </Link>
            {allowLayaway ? (
              buyerLayawayBlocked ? (
                <p className="mt-2.5 rounded-xl border border-amber-500/25 bg-amber-950/15 px-3 py-2.5 text-center text-xs leading-snug text-amber-100/90">
                  {buyerLayawayBlocked}
                </p>
              ) : (
                <Link
                  href={layawayHref}
                  className="mt-2.5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-gold/35 bg-gold/10 text-sm font-semibold text-gold-bright transition hover:border-gold/55 hover:bg-gold/15 active:scale-[0.995]"
                >
                  Start layaway
                </Link>
              )
            ) : null}
          </>
        )}

        {(showMakeOffer || (showTradeButton && !tradeOnly)) && !isOwnListing ? (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {showMakeOffer ? (
              <button
                type="button"
                onClick={() => openOfferModal()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.14] bg-[#0c0c10] text-sm font-semibold text-zinc-100 transition hover:border-white/25 hover:bg-[#121216] active:scale-[0.995]"
              >
                <OfferIcon />
                Make offer
              </button>
            ) : (
              <span />
            )}
            {showTradeButton ? (
              <Link
                href={`/trade/new?listingId=${encodeURIComponent(listing.id)}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/[0.06] text-sm font-semibold text-gold-bright transition hover:border-gold/45 hover:bg-gold/10 active:scale-[0.995]"
              >
                <TradeIcon />
                Trade offer
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <MarketplaceMakeOfferModal
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listingTitle={listing.title}
        askingLines={askingLines}
        minimumOfferUsd={listing.minimumOfferUsd}
        onSubmit={handleOfferSubmit}
      />
    </>
  );

  if (part === "price") return priceBlock;
  if (part === "actions") return actionsBlock;

  return (
    <>
      {priceBlock}
      {actionsBlock}
    </>
  );
}
