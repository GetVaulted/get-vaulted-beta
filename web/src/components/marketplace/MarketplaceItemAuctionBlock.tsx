"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { useRealtimeListingBidsSubscription } from "@/hooks/useRealtimeListingBidsSubscription";
import { MarketplacePlaceBidModal } from "@/components/marketplace/MarketplacePlaceBidModal";

type BidRow = {
  id: string;
  amountUsd: number;
  bidderUsername: string;
  createdAt: string;
};

type BidsApi = {
  bids?: BidRow[];
  bidCount?: number;
  currentBidUsd?: number | null;
  startingBidUsd?: number;
  minNextBidUsd?: number;
  auctionEndsAt?: string | null;
  auctionEnded?: boolean;
  error?: string;
};

export type MarketplaceItemAuctionBlockProps = {
  listingId: string;
  isOwnListing: boolean;
  initialStartingBidUsd: number;
  initialCurrentBidUsd: number | null;
  initialBidCount: number;
  initialMinNextBidUsd: number;
  initialAuctionEndsAtIso?: string | null;
  initialAuctionEnded: boolean;
  /** Short shipping line for the purchase card (estimate). */
  shippingEstimate: string;
  /** Static “watching” count from listing extras (not live-updated). */
  watchingCount: number;
  makeOfferButton: ReactNode | null;
  watchButton: ReactNode | null;
};

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatCountdown(ms: number) {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatBidTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function AuctionCountdown({ endsAt, ended }: { endsAt: string; ended: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ms = new Date(endsAt).getTime() - now;
  const cd = formatCountdown(ms);

  if (!mounted) {
    return <span className="text-xs font-semibold text-zinc-500">—</span>;
  }

  if (ended || !cd) {
    return <span className="text-xs font-semibold text-zinc-400">Ended</span>;
  }

  return <span className="font-mono text-sm font-bold tabular-nums text-rose-200 sm:text-base">{cd}</span>;
}

export function MarketplaceItemAuctionBlock({
  listingId,
  isOwnListing,
  initialStartingBidUsd,
  initialCurrentBidUsd,
  initialBidCount,
  initialMinNextBidUsd,
  initialAuctionEndsAtIso,
  initialAuctionEnded,
  shippingEstimate,
  watchingCount,
  makeOfferButton,
  watchButton,
}: MarketplaceItemAuctionBlockProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [startingBidUsd, setStartingBidUsd] = useState(initialStartingBidUsd);
  const [currentBidUsd, setCurrentBidUsd] = useState<number | null>(initialCurrentBidUsd);
  const [bidCount, setBidCount] = useState(initialBidCount);
  const [minNextBidUsd, setMinNextBidUsd] = useState(initialMinNextBidUsd);
  const [auctionEndsAt, setAuctionEndsAt] = useState<string | null | undefined>(initialAuctionEndsAtIso);
  const [auctionEnded, setAuctionEnded] = useState(initialAuctionEnded);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingBids, setLoadingBids] = useState(true);
  const [bidModalOpen, setBidModalOpen] = useState(false);

  const displayHigh = currentBidUsd ?? startingBidUsd;
  const hasBids = currentBidUsd != null;
  const canBid = !auctionEnded && !isOwnListing;

  useEffect(() => {
    setStartingBidUsd(initialStartingBidUsd);
    setCurrentBidUsd(initialCurrentBidUsd);
    setBidCount(initialBidCount);
    setMinNextBidUsd(initialMinNextBidUsd);
    setAuctionEndsAt(initialAuctionEndsAtIso);
    setAuctionEnded(initialAuctionEnded);
  }, [
    listingId,
    initialStartingBidUsd,
    initialCurrentBidUsd,
    initialBidCount,
    initialMinNextBidUsd,
    initialAuctionEndsAtIso,
    initialAuctionEnded,
  ]);

  const loadBids = useCallback(async () => {
    setLoadingBids(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${encodeURIComponent(listingId)}/bids`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as BidsApi;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not load bids.");
        setBids([]);
        return;
      }
      if (Array.isArray(data.bids)) setBids(data.bids);
      if (typeof data.bidCount === "number") setBidCount(data.bidCount);
      if ("currentBidUsd" in data) setCurrentBidUsd(data.currentBidUsd ?? null);
      if (typeof data.startingBidUsd === "number") setStartingBidUsd(data.startingBidUsd);
      if (typeof data.minNextBidUsd === "number") setMinNextBidUsd(data.minNextBidUsd);
      if ("auctionEndsAt" in data) setAuctionEndsAt(data.auctionEndsAt ?? null);
      if (typeof data.auctionEnded === "boolean") setAuctionEnded(data.auctionEnded);
    } finally {
      setLoadingBids(false);
    }
  }, [listingId]);

  useEffect(() => {
    void loadBids();
  }, [loadBids]);

  useRealtimeListingBidsSubscription(listingId, () => void loadBids(), true);

  const openPlaceBid = () => {
    setError(null);
    if (auctionEnded) {
      setError("Auction has ended");
      return;
    }
    if (isOwnListing) {
      setError("You cannot bid on your own listing.");
      return;
    }
    if (!session?.user?.id) {
      const ret = pathname || `/marketplace/${encodeURIComponent(listingId)}`;
      router.push(`/signin?returnTo=${encodeURIComponent(ret)}`);
      return;
    }
    setBidModalOpen(true);
  };

  return (
    <div id="item-auction" className="scroll-mt-24 space-y-3">
      <div className="space-y-3 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3 sm:p-3.5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
            {hasBids ? "Current bid" : "Starting bid"}
          </p>
          <p className="font-mono text-3xl font-black tracking-tight text-gold-bright sm:text-4xl">{formatMoney(displayHigh)}</p>
          {!hasBids ? (
            <p className="mt-1 text-xs text-zinc-400">
              No bids yet — opens at <span className="font-mono text-zinc-200">{formatMoney(startingBidUsd)}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">
              Started at <span className="font-mono text-zinc-200">{formatMoney(startingBidUsd)}</span>
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-white/[0.08] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Time left</p>
            {auctionEndsAt ? (
              <AuctionCountdown endsAt={auctionEndsAt} ended={auctionEnded} />
            ) : (
              <span className="text-xs text-zinc-400">—</span>
            )}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Shipping</p>
            <p className="max-w-[min(100%,14rem)] text-right text-xs font-medium leading-snug text-zinc-200">{shippingEstimate}</p>
          </div>
          <p className="text-xs text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-100">{loadingBids ? "…" : bidCount}</span>{" "}
            {bidCount === 1 ? "bid" : "bids"}
            <span className="text-zinc-600"> · </span>
            <span className="font-semibold tabular-nums text-zinc-100">{watchingCount}</span> watching
          </p>
        </div>

        {auctionEnded ? (
          <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-400">
            This auction has closed.{" "}
            {session?.user?.id && !isOwnListing ? (
              <Link href="/account/orders" className="font-semibold text-gold-bright hover:underline">
                View orders
              </Link>
            ) : !session?.user?.id ? (
              <Link
                href={`/signin?returnTo=${encodeURIComponent(pathname || `/marketplace/${encodeURIComponent(listingId)}`)}`}
                className="font-semibold text-gold-bright hover:underline"
              >
                Sign in to see your orders
              </Link>
            ) : null}
          </p>
        ) : null}

        {isOwnListing && !auctionEnded ? (
          <p className="rounded-lg border border-amber-400/20 bg-amber-950/20 px-3 py-2.5 text-sm text-amber-100/90">
            You cannot bid on your own listing.
          </p>
        ) : null}

        {!auctionEnded && canBid && !session?.user?.id ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3">
            <p className="text-sm text-zinc-400">Sign in to place a bid on this auction.</p>
            <Link
              href={`/signin?returnTo=${encodeURIComponent(pathname || `/marketplace/${encodeURIComponent(listingId)}`)}`}
              className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_28px_-6px_rgba(201,162,39,0.55)] transition hover:brightness-110 sm:w-auto sm:min-w-[200px]"
            >
              Sign in to bid
            </Link>
          </div>
        ) : null}

        {!auctionEnded && canBid && session?.user?.id ? (
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => openPlaceBid()}
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gradient-to-r from-gold to-gold-bright text-sm font-bold text-zinc-950 shadow-[0_0_24px_-8px_rgba(201,162,39,0.45)] transition hover:brightness-110 active:scale-[0.99]"
            >
              Place bid
            </button>
            <div className="flex flex-col gap-2">
              {makeOfferButton}
              {watchButton}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-400/25 bg-rose-950/25 px-3 py-2 text-sm text-rose-100/95" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3 sm:p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Bid history</p>
        {loadingBids && bids.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">Loading…</p>
        ) : bids.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">No bids yet.</p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1 text-xs sm:text-sm">
            {bids.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.05] pb-2 last:border-0"
              >
                <span className="font-mono font-semibold text-gold-bright/95">{formatMoney(b.amountUsd)}</span>
                <span className="text-xs text-zinc-500">
                  @{b.bidderUsername} · {formatBidTime(b.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MarketplacePlaceBidModal
        open={bidModalOpen}
        onClose={() => setBidModalOpen(false)}
        listingId={listingId}
        displayBidUsd={displayHigh}
        shippingLine={shippingEstimate}
        auctionEndsAt={auctionEndsAt}
        auctionEnded={auctionEnded}
        minNextBidUsd={minNextBidUsd}
        onPlaced={() => {
          void loadBids();
          router.refresh();
        }}
      />
    </div>
  );
}
