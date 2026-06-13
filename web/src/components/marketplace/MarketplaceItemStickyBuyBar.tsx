"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

const SENTINEL_ID = "item-primary-cta-sentinel";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

type MarketplaceItemStickyBuyBarProps = {
  mode: "buy_now" | "auction";
  buyNowPrice: number;
  auctionCurrentBid: number;
  listingId: string;
  listingTitle: string;
  sellerId?: string;
  auctionEnded?: boolean;
};

export function MarketplaceItemStickyBuyBar({
  mode,
  buyNowPrice,
  auctionCurrentBid,
  listingId,
  listingTitle,
  sellerId,
  auctionEnded = false,
}: MarketplaceItemStickyBuyBarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const isOwnListing = Boolean(session?.user?.id && sellerId && session.user.id === sellerId);
  const checkoutHref = `/checkout/${encodeURIComponent(listingId)}`;
  const signInForCheckoutHref = `/signin?returnTo=${encodeURIComponent(checkoutHref)}`;
  const signInForBidHref = `/signin?returnTo=${encodeURIComponent(pathname || `/marketplace/${encodeURIComponent(listingId)}`)}`;

  useEffect(() => {
    const el = document.getElementById(SENTINEL_ID);
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setVisible(!entry.isIntersecting);
      },
      { root: null, rootMargin: "0px", threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!visible) return null;

  const price = mode === "buy_now" ? buyNowPrice : auctionCurrentBid;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.1] bg-[#070709]/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl supports-[backdrop-filter]:bg-[#070709]/80"
      role="region"
      aria-label="Quick purchase"
    >
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-10">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-300">{listingTitle}</p>
          <p className="font-mono text-xl font-black tabular-nums tracking-tight text-gold-bright sm:text-2xl">
            {formatMoney(price)}
          </p>
        </div>
        {isOwnListing ? (
          <span className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-white/12 px-4 text-xs font-medium text-zinc-500">
            Your listing
          </span>
        ) : mode === "buy_now" ? (
          status === "loading" ? (
            <span className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-white/12 px-6 text-xs text-zinc-500">
              …
            </span>
          ) : status === "unauthenticated" ? (
            <Link
              href={signInForCheckoutHref}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 transition hover:brightness-110"
            >
              Sign in to buy
            </Link>
          ) : (
            <Link
              href={checkoutHref}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 transition hover:brightness-110 sm:min-w-[140px]"
            >
              Buy now
            </Link>
          )
        ) : auctionEnded ? (
          <span className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-white/12 px-4 text-xs font-semibold text-zinc-400">
            Ended
          </span>
        ) : status === "unauthenticated" ? (
          <Link
            href={signInForBidHref}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 transition hover:brightness-110"
          >
            Sign in
          </Link>
        ) : (
          <Link
            href="#item-auction"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-gold to-gold-bright px-6 text-sm font-bold text-zinc-950 transition hover:brightness-110"
          >
            Place bid
          </Link>
        )}
      </div>
    </div>
  );
}
