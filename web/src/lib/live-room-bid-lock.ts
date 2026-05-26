import type { Prisma } from "@/generated/prisma/client";

export type LockedLiveRoomItemForBid = {
  id: string;
  liveRoomId: string;
  listingId: string | null;
  title: string;
  status: string;
  currentBidUsd: number | null;
  startingBidUsd: number | null;
  priceUsd: number | null;
  biddingOpen: boolean;
  auctionEndsAt: Date | null;
  clutchTimeEnabled: boolean;
  lastHighBidderId: string | null;
  itemVersion: number;
};

type LockedRow = {
  id: string;
  liveRoomId: string;
  listingId: string | null;
  title: string;
  status: string;
  currentBidUsd: number | null;
  startingBidUsd: number | null;
  priceUsd: number | null;
  biddingOpen: boolean;
  auctionEndsAt: Date | null;
  clutchTimeEnabled: boolean;
  lastHighBidderId: string | null;
  itemVersion: number;
};

/**
 * Row-level lock on the active lot (`FOR UPDATE`) and server-time auction window validation.
 * Must run inside the same transaction as bid acceptance.
 */
export async function lockActiveLiveRoomItemForBid(
  tx: Prisma.TransactionClient,
  args: { liveRoomId: string; itemId: string; now: Date },
): Promise<LockedLiveRoomItemForBid> {
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT
      id,
      "liveRoomId",
      "listingId",
      title,
      status,
      "currentBidUsd",
      "startingBidUsd",
      "priceUsd",
      "biddingOpen",
      "auctionEndsAt",
      "clutchTimeEnabled",
      "lastHighBidderId",
      "itemVersion"
    FROM "LiveRoomItem"
    WHERE id = ${args.itemId} AND "liveRoomId" = ${args.liveRoomId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new Error("ITEM_NOT_FOUND");
  if (row.status !== "active") throw new Error("ITEM_NOT_ACTIVE");
  if (!row.biddingOpen) throw new Error("BIDDING_NOT_OPEN");
  if (row.auctionEndsAt && row.auctionEndsAt <= args.now) throw new Error("ENDED");
  return row;
}

/** Reject non-increasing rebids from the current high bidder (server decides leader). */
export function assertBidExceedsCurrentHigh(args: {
  bidderId: string;
  amountUsd: number;
  lastHighBidderId: string | null;
  currentHighUsd: number;
}): void {
  if (args.lastHighBidderId !== args.bidderId) return;
  if (args.amountUsd <= args.currentHighUsd + 0.001) {
    throw new Error("ALREADY_HIGH_BIDDER");
  }
}

export function currentHighUsdFromLockedItem(item: LockedLiveRoomItemForBid): number {
  return item.currentBidUsd ?? item.startingBidUsd ?? item.priceUsd ?? 0;
}
