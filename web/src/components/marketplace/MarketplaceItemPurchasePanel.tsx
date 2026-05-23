"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import type { MarketplaceListing } from "@/content/marketplace-listings";
import type { ItemPageExtras } from "@/lib/marketplace-item-extras";
import { isLegacyMarketplaceTimedAuction } from "@/lib/marketplace-commerce-policy";
import { MarketplaceMakeOfferModal } from "@/components/marketplace/MarketplaceMakeOfferModal";
import { MarketplaceWatchlistToggle } from "@/components/marketplace/MarketplaceWatchlistToggle";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function ShippingTransparencyBlock({ extras }: { extras: ItemPageExtras }) {
  const ships =
    extras.shipsFromDisplay ??
    "Exact origin is confirmed on the order after checkout (US sellers ship from their verified address).";
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#08080a]/90 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Shipping and delivery</p>
      <dl className="mt-3 space-y-2.5 text-xs leading-snug text-zinc-400">
        <div>
          <dt className="font-semibold text-zinc-300">Estimated shipping</dt>
          <dd className="mt-0.5 text-zinc-400">{extras.estimatedShippingDisplay} (charged at checkout)</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-300">Ships from</dt>
          <dd className="mt-0.5 text-zinc-400">{ships}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-300">Handling</dt>
          <dd className="mt-0.5 text-zinc-400">{extras.handlingEstimateDisplay}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-300">Tracking</dt>
          <dd className="mt-0.5 text-zinc-400">{extras.trackingAfterPurchaseLine}</dd>
        </div>
      </dl>
    </div>
  );
}

function ItemBuyAssuranceList({ shipLine }: { shipLine: string }) {
  return (
    <ul className="space-y-2 text-xs leading-snug text-zinc-400">
      <li className="flex gap-2">
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-400/90" aria-hidden />
        <span>
          <span className="font-medium text-zinc-200">{shipLine}</span>
          <span className="text-zinc-500"> · </span>
          Insured delivery
        </span>
      </li>
      <li className="flex gap-2">
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-400/90" aria-hidden />
        <span>
          <span className="font-medium text-zinc-200">Secure checkout</span>
          <span className="text-zinc-500"> · </span>
          Purchase protection
        </span>
      </li>
      <li className="flex gap-2">
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-bright/90" aria-hidden />
        <span>
          <span className="font-medium text-zinc-200">Verified seller</span>
          <span className="text-zinc-500"> · </span>
          Vetted on Get Vaulted
        </span>
      </li>
    </ul>
  );
}

type MarketplaceItemPurchasePanelProps = {
  listing: MarketplaceListing;
  extras: ItemPageExtras;
};

export function MarketplaceItemPurchasePanel({ listing, extras }: MarketplaceItemPurchasePanelProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [offerOpen, setOfferOpen] = useState(false);
  const allowOffers = listing.allowOffers === true;
  const allowTrades = listing.acceptTradeOffers === true;
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
    listing.listingStatus === "auction_live";
  const checkoutHref = `/checkout/${encodeURIComponent(listing.id)}`;

  const askingLines = useMemo(
    () => [{ label: "Asking price", value: formatMoney(listing.price) }],
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
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
          {legacyAuction
            ? "This listing is no longer available in the marketplace. Auctions now run only during Live Shows."
            : "This listing is not available for purchase right now."}
        </p>
        <Link href="/marketplace" className="text-sm font-semibold text-gold-bright hover:underline">
          Browse marketplace
        </Link>
      </div>
    );
  }

  const makeOfferControl = showMakeOffer ? (
    <button
      type="button"
      onClick={() => openOfferModal()}
      className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.03] text-sm font-medium text-zinc-200 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-zinc-50 active:scale-[0.99]"
    >
      Make offer
    </button>
  ) : null;
  const tradeControl = showTradeButton ? (
    <Link
      href={`/trade/new?listingId=${encodeURIComponent(listing.id)}`}
      className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gold/35 bg-gold/10 text-sm font-semibold text-gold-bright transition hover:border-gold/55 hover:bg-gold/15 active:scale-[0.99]"
    >
      Start trade offer
    </Link>
  ) : null;

  return (
    <>
      <p className="font-mono text-3xl font-black tracking-tight text-gold-bright sm:text-4xl">{formatMoney(listing.price)}</p>
      <div className="pt-1">
        {isOwnListing ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-zinc-400">
            This is your listing — buyers will use Buy now here.
          </p>
        ) : (
          <Link
            id="checkout"
            href={checkoutHref}
            className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 shadow-[0_0_28px_-8px_rgba(201,162,39,0.5)] transition hover:brightness-110 active:scale-[0.99]"
          >
            Buy now
          </Link>
        )}
        {makeOfferControl ? <div className="mt-2.5">{makeOfferControl}</div> : null}
        {tradeControl ? <div className="mt-2.5">{tradeControl}</div> : null}
        <p className="mt-2 text-center text-xs leading-snug text-zinc-400">
          Free protected checkout <span className="text-zinc-500">·</span> {extras.handlingEstimateDisplay}
        </p>
      </div>
      <div className="mt-4">
        <ShippingTransparencyBlock extras={extras} />
      </div>
      <div className="mt-4">
        <ItemBuyAssuranceList shipLine={extras.shipSpeedLine} />
      </div>
      <div className="mt-4">
        <MarketplaceWatchlistToggle listingId={listing.id} sellerId={listing.sellerId} variant="row" />
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
}
