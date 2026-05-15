"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { MarketplaceWatchlistToggle } from "@/components/marketplace/MarketplaceWatchlistToggle";
import { SellerFollowButton } from "@/components/seller/SellerFollowButton";

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
      { root: null, rootMargin: "0px 0px 0px 0px", threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.12] bg-[#08080c]/92 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md supports-[backdrop-filter]:bg-[#08080c]/85"
      role="region"
      aria-label="Quick purchase"
    >
      <div className="mx-auto flex h-[72px] max-h-[72px] w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        {mode === "buy_now" ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-base font-black tabular-nums tracking-tight text-gold-bright sm:text-lg">
                {formatMoney(buyNowPrice)}
              </p>
              <p className="truncate text-[11px] leading-tight text-zinc-400">{listingTitle}</p>
            </div>
            {isOwnListing ? (
              <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-white/12 px-3 text-xs font-medium text-zinc-500">
                Your listing
              </span>
            ) : (
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                {sellerId ? (
                  <SellerFollowButton sellerUserId={sellerId} variant="inline" showFollowerCount={false} />
                ) : null}
                <MarketplaceWatchlistToggle listingId={listingId} sellerId={sellerId} variant="sticky" />
                {status === "loading" ? (
                  <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-white/12 px-4 text-xs text-zinc-500">
                    …
                  </span>
                ) : status === "unauthenticated" ? (
                  <Link
                    href={signInForCheckoutHref}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright px-5 text-xs font-bold text-zinc-950 shadow-[0_0_20px_-8px_rgba(201,162,39,0.45)] transition hover:brightness-110 sm:px-6 sm:text-sm"
                  >
                    Sign in
                  </Link>
                ) : (
                  <Link
                    href={checkoutHref}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright px-5 text-xs font-bold text-zinc-950 shadow-[0_0_20px_-8px_rgba(201,162,39,0.45)] transition hover:brightness-110 sm:px-6 sm:text-sm"
                  >
                    Buy now
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Current bid</p>
              <p className="truncate font-mono text-base font-black tabular-nums tracking-tight text-gold-bright sm:text-lg">
                {formatMoney(auctionCurrentBid)}
              </p>
              <p className="truncate text-[11px] leading-tight text-zinc-400">{listingTitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {!isOwnListing && sellerId ? (
                <SellerFollowButton sellerUserId={sellerId} variant="inline" showFollowerCount={false} />
              ) : null}
              {!isOwnListing ? (
                <MarketplaceWatchlistToggle listingId={listingId} sellerId={sellerId} variant="sticky" />
              ) : null}
              {auctionEnded ? (
                <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-white/12 px-4 text-xs font-semibold text-zinc-400">
                  Ended
                </span>
              ) : status === "loading" ? (
                <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-white/12 px-4 text-xs text-zinc-500">
                  …
                </span>
              ) : status === "unauthenticated" ? (
                <Link
                  href={signInForBidHref}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright px-5 text-xs font-bold text-zinc-950 shadow-[0_0_20px_-8px_rgba(201,162,39,0.45)] transition hover:brightness-110 sm:px-6 sm:text-sm"
                >
                  Sign in
                </Link>
              ) : (
                <Link
                  href="#item-auction"
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright px-5 text-xs font-bold text-zinc-950 shadow-[0_0_20px_-8px_rgba(201,162,39,0.45)] transition hover:brightness-110 sm:px-6 sm:text-sm"
                >
                  Place bid
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
