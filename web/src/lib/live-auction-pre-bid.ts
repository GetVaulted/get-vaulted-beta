import type { Prisma } from "@/generated/prisma/client";
import { liveAuctionMinBidUsd } from "@/lib/auction";
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
};

export function isLiveAuctionPreBidEligible(item: PreBidEligibleItem): boolean {
  if (item.salesFormat === "buy_now") return false;
  if (item.salesFormat === "variant_selection" || item.salesFormat === "team_break") return false;
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

/** Apply the highest stored proxy as the visible opening leader when a lot goes on screen or bidding opens. */
export async function applyHighestPreBidToLiveItem(
  tx: Prisma.TransactionClient,
  args: { liveRoomId: string; itemId: string },
): Promise<{ applied: boolean; amountUsd: number | null; userId: string | null }> {
  const top = await tx.liveAuctionProxyBid.findFirst({
    where: { liveRoomItemId: args.itemId, liveRoomId: args.liveRoomId },
    orderBy: [{ maxAmountUsd: "desc" }, { updatedAt: "asc" }],
    select: { userId: true, maxAmountUsd: true },
  });
  if (!top) return { applied: false, amountUsd: null, userId: null };

  await tx.liveRoomItem.updateMany({
    where: { id: args.itemId, liveRoomId: args.liveRoomId, biddingOpen: false },
    data: {
      currentBidUsd: top.maxAmountUsd,
      lastHighBidderId: top.userId,
      itemVersion: { increment: 1 },
    },
  });
  return { applied: true, amountUsd: top.maxAmountUsd, userId: top.userId };
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

  const currentHigh = args.item.currentBidUsd ?? 0;
  const hasLeader = Boolean(args.item.lastHighBidderId?.trim());
  const beatsVisible =
    args.item.status === "active" &&
    (!hasLeader || args.amountUsd > currentHigh + 0.001 || args.item.lastHighBidderId === args.userId);

  if (beatsVisible) {
    await tx.liveRoomItem.updateMany({
      where: {
        id: args.item.id,
        liveRoomId: args.liveRoomId,
        status: "active",
        biddingOpen: false,
      },
      data: {
        currentBidUsd: args.amountUsd,
        lastHighBidderId: args.userId,
        itemVersion: { increment: 1 },
      },
    });
  }

  await tx.liveRoom.update({
    where: { id: args.liveRoomId },
    data: { roomVersion: { increment: 1 } },
  });

  return { accepted: true, amountUsd: args.amountUsd };
}
