import { minNextBidUsd } from "@/lib/auction";

export type BidLike = {
  bidderId: string;
  amountUsd: number;
  maxBidUsd: number | null;
  createdAt: Date;
};

/** Per-bidder: highest max willing to pay and earliest participation (tie-break). */
export function aggregateBidderCaps(bids: BidLike[]): { bidderId: string; max: number; tieTime: Date }[] {
  const map = new Map<string, { max: number; tieTime: Date }>();
  for (const b of bids) {
    const cap = b.maxBidUsd ?? b.amountUsd;
    const prev = map.get(b.bidderId);
    if (!prev) {
      map.set(b.bidderId, { max: cap, tieTime: b.createdAt });
      continue;
    }
    const nextMax = Math.max(prev.max, cap);
    const tieTime = new Date(Math.min(prev.tieTime.getTime(), b.createdAt.getTime()));
    map.set(b.bidderId, { max: nextMax, tieTime });
  }
  return Array.from(map.entries()).map(([bidderId, v]) => ({ bidderId, max: v.max, tieTime: v.tieTime }));
}

export type ResolvedAuction = {
  displayUsd: number;
  leaderBidderId: string | null;
};

/**
 * Computes visible auction price and leader from all bids + starting high.
 * `startingHigh` is the opening value before any bids (startingBidUsd / priceUsd).
 */
export function resolveProxyAuction(startingHigh: number, bids: BidLike[]): ResolvedAuction {
  const agg = aggregateBidderCaps(bids);
  if (agg.length === 0) {
    return { displayUsd: startingHigh, leaderBidderId: null };
  }
  agg.sort((a, b) => {
    if (b.max !== a.max) return b.max - a.max;
    return a.tieTime.getTime() - b.tieTime.getTime();
  });
  const leader = agg[0]!;
  if (agg.length === 1) {
    return {
      displayUsd: Math.min(leader.max, minNextBidUsd(startingHigh)),
      leaderBidderId: leader.bidderId,
    };
  }
  const second = agg[1]!;
  return {
    displayUsd: Math.min(leader.max, minNextBidUsd(second.max)),
    leaderBidderId: leader.bidderId,
  };
}
