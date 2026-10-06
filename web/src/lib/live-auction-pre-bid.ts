import type { Prisma } from "@/generated/prisma/client";
import { liveAuctionMinBidUsd, minNextBidUsd } from "@/lib/auction";
import { liveAuctionOpeningBidUsd } from "@/lib/live-auction-overlay-price";
import { upsertLiveAuctionProxyBid } from "@/services/live-auction/resolve-live-proxy-bid-chain";

export type PreBidEligibleItem = {
  id: string;
  status: string;
  salesFormat: string;
  listingId: string | null;
  biddingOpen: boolean;
  startingBidUsd: number | null;
  currentBidUsd: number | null;
  lastHighBidderId: string | null;
  bidIncrementUsd?: number | null;
  priceUsd?: number | null;
};

export type LivePreBidProxyCap = {
  userId: string;
  maxAmountUsd: number;
  /** Earlier standing bid wins ties at the same max. */
  tieTimeMs: number;
};

/**
 * Visible price for standing max/pre-bids — never the raw max.
 * Sole leader sits at opening; competing maxes advance one increment above second place.
 */
export function resolveLivePreBidVisiblePrice(
  openingUsd: number,
  proxies: LivePreBidProxyCap[],
): { userId: string; displayUsd: number } | null {
  const opening = openingUsd > 0 ? openingUsd : 1;
  const eligible = proxies
    .filter((p) => Number.isFinite(p.maxAmountUsd) && p.maxAmountUsd + 0.001 >= opening)
    .sort((a, b) => {
      if (b.maxAmountUsd !== a.maxAmountUsd) return b.maxAmountUsd - a.maxAmountUsd;
      return a.tieTimeMs - b.tieTimeMs;
    });
  if (eligible.length === 0) return null;

  const leader = eligible[0]!;
  if (eligible.length === 1) {
    return { userId: leader.userId, displayUsd: opening };
  }

  const second = eligible[1]!;
  const displayUsd = Math.min(leader.maxAmountUsd, Math.max(opening, minNextBidUsd(second.maxAmountUsd)));
  return { userId: leader.userId, displayUsd };
}

export function isLiveAuctionPreBidEligible(item: PreBidEligibleItem): boolean {
  if (item.salesFormat === "buy_now") return false;
  if (item.salesFormat === "variant_selection" || item.salesFormat === "team_break" || item.salesFormat === "player_selection") return false;
  if (item.listingId) return false;
  if (item.biddingOpen) return false;
  return item.status === "active" || item.status === "queued";
}

export function liveAuctionPreBidMinUsd(item: PreBidEligibleItem): number {
  if (item.status === "active" && item.lastHighBidderId) {
    return liveAuctionMinBidUsd({
      currentBidUsd: item.currentBidUsd,
      startingBidUsd: item.startingBidUsd,
      lastHighBidderId: item.lastHighBidderId,
    });
  }
  const start = item.startingBidUsd;
  if (typeof start === "number" && Number.isFinite(start) && start > 0) return start;
  return 1;
}

async function loadResolvedPreBidLeader(
  tx: Prisma.TransactionClient,
  args: { liveRoomId: string; itemId: string },
): Promise<{ userId: string; displayUsd: number } | null> {
  const item = await tx.liveRoomItem.findUnique({
    where: { id: args.itemId },
    select: { startingBidUsd: true, priceUsd: true, liveRoomId: true },
  });
  if (!item || item.liveRoomId !== args.liveRoomId) return null;

  const proxies = await tx.liveAuctionProxyBid.findMany({
    where: { liveRoomItemId: args.itemId, liveRoomId: args.liveRoomId },
    select: { userId: true, maxAmountUsd: true, updatedAt: true },
  });
  const opening = liveAuctionOpeningBidUsd(item);
  return resolveLivePreBidVisiblePrice(
    opening,
    proxies.map((p) => ({
      userId: p.userId,
      maxAmountUsd: p.maxAmountUsd,
      tieTimeMs: p.updatedAt.getTime(),
    })),
  );
}

/** Apply standing max/pre-bids as the visible opening leader when a lot pins or bidding opens. */
export async function applyHighestPreBidToLiveItem(
  tx: Prisma.TransactionClient,
  args: { liveRoomId: string; itemId: string },
): Promise<{ applied: boolean; amountUsd: number | null; userId: string | null }> {
  const resolved = await loadResolvedPreBidLeader(tx, args);
  if (!resolved) return { applied: false, amountUsd: null, userId: null };

  await tx.liveRoomItem.updateMany({
    where: { id: args.itemId, liveRoomId: args.liveRoomId, biddingOpen: false },
    data: {
      currentBidUsd: resolved.displayUsd,
      lastHighBidderId: resolved.userId,
      itemVersion: { increment: 1 },
    },
  });
  return { applied: true, amountUsd: resolved.displayUsd, userId: resolved.userId };
}

/** Drop standing max/proxy bids when a unit sells or a round resets — next unit must not inherit them. */
export async function clearLiveAuctionProxyBidsForItem(
  tx: Prisma.TransactionClient,
  args: { liveRoomId: string; itemId: string },
): Promise<number> {
  const result = await tx.liveAuctionProxyBid.deleteMany({
    where: { liveRoomId: args.liveRoomId, liveRoomItemId: args.itemId },
  });
  return result.count;
}

export async function placeLiveAuctionPreBid(
  tx: Prisma.TransactionClient,
  args: {
    liveRoomId: string;
    item: PreBidEligibleItem;
    userId: string;
    amountUsd: number;
  },
): Promise<{ accepted: boolean; amountUsd: number }> {
  const min = liveAuctionPreBidMinUsd(args.item);
  if (args.amountUsd + 0.001 < min) {
    throw new Error("PRE_BID_TOO_LOW");
  }

  await upsertLiveAuctionProxyBid(tx, {
    liveRoomId: args.liveRoomId,
    liveRoomItemId: args.item.id,
    userId: args.userId,
    maxAmountUsd: args.amountUsd,
    listingId: args.item.listingId,
  });

  if (args.item.status === "active") {
    const resolved = await loadResolvedPreBidLeader(tx, {
      liveRoomId: args.liveRoomId,
      itemId: args.item.id,
    });
    if (resolved) {
      await tx.liveRoomItem.updateMany({
        where: {
          id: args.item.id,
          liveRoomId: args.liveRoomId,
          status: "active",
          biddingOpen: false,
        },
        data: {
          currentBidUsd: resolved.displayUsd,
          lastHighBidderId: resolved.userId,
          itemVersion: { increment: 1 },
        },
      });
    }
  }

  await tx.liveRoom.update({
    where: { id: args.liveRoomId },
    data: { roomVersion: { increment: 1 } },
  });

  return { accepted: true, amountUsd: args.amountUsd };
}
