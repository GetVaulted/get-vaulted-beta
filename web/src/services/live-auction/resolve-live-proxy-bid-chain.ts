import type { Prisma } from "@/generated/prisma/client";
import { minNextBidUsd } from "@/lib/auction";
import { computeNextAuctionEndsAtAfterBid } from "@/lib/live-auction-bid-extension";
import { LIVE_AUCTION_EVENT_PAYLOAD_VERSION, type LiveAuctionBidPlacedPayloadV1 } from "@/lib/live-auction-event-schema";
import { getTransactionServerNow } from "@/lib/server-transaction-now";
import { recordLiveRoomBid } from "@/lib/record-live-room-bid";

const MAX_PROXY_CHAIN = 32;

/**
 * After a human bid is accepted on a **host-only** lot (`listingId == null`), applies automatic
 * proxy (max-bid) responses in deterministic order until no eligible proxy remains.
 *
 * **Not used** for marketplace listing lots (`placeListingBid` path) — those use `Bid` rows only.
 */
export async function resolveLiveProxyBidChain(
  tx: Prisma.TransactionClient,
  ctx: {
    liveRoomId: string;
    itemId: string;
    clutchTimeEnabled: boolean;
    listingId: string | null;
  },
): Promise<Array<{ userId: string; amountUsd: number }>> {
  if (ctx.listingId) return [];

  const outbids: Array<{ userId: string; amountUsd: number }> = [];

  for (let i = 0; i < MAX_PROXY_CHAIN; i += 1) {
    const row = await tx.liveRoomItem.findUnique({
      where: { id: ctx.itemId },
      select: {
        liveRoomId: true,
        listingId: true,
        status: true,
        biddingOpen: true,
        currentBidUsd: true,
        lastHighBidderId: true,
        auctionEndsAt: true,
      },
    });
    if (!row || row.liveRoomId !== ctx.liveRoomId || row.status !== "active" || !row.biddingOpen) return outbids;
    if (row.listingId) return outbids;

    const high = row.currentBidUsd ?? 0;
    const leaderId = row.lastHighBidderId;
    if (!leaderId) return outbids;

    const now = await getTransactionServerNow(tx);
    if (row.auctionEndsAt && row.auctionEndsAt <= now) return outbids;

    const minNeed = minNextBidUsd(high);
    const proxy = await tx.liveAuctionProxyBid.findFirst({
      where: {
        liveRoomItemId: ctx.itemId,
        userId: { not: leaderId },
        maxAmountUsd: { gte: minNeed },
      },
      orderBy: [{ maxAmountUsd: "desc" }, { userId: "asc" }],
    });
    if (!proxy) return outbids;

    outbids.push({ userId: leaderId, amountUsd: minNeed });

    const bidAmount = minNeed;
    const nextEndsAt = computeNextAuctionEndsAtAfterBid(now, ctx.clutchTimeEnabled, row.auctionEndsAt);

    const write = await tx.liveRoomItem.updateMany({
      where: {
        id: ctx.itemId,
        liveRoomId: ctx.liveRoomId,
        status: "active",
        biddingOpen: true,
        AND: [
          {
            OR: [{ auctionEndsAt: null }, { auctionEndsAt: { gt: now } }],
          },
          {
            OR: [{ currentBidUsd: null }, { currentBidUsd: { lt: bidAmount } }],
          },
        ],
      },
      data: {
        currentBidUsd: bidAmount,
        lastHighBidderId: proxy.userId,
        ...(nextEndsAt ? { auctionEndsAt: nextEndsAt } : {}),
        itemVersion: { increment: 1 },
      },
    });
    if (write.count === 0) return outbids;

    const roomWrite = await tx.liveRoom.update({
      where: { id: ctx.liveRoomId },
      data: { roomVersion: { increment: 1 }, auctionEventSeq: { increment: 1 } },
      select: { roomVersion: true, auctionEventSeq: true },
    });

    const itemState = await tx.liveRoomItem.findUnique({
      where: { id: ctx.itemId },
      select: { itemVersion: true, auctionEndsAt: true },
    });
    const leaderUserRow = await tx.user.findUnique({
      where: { id: proxy.userId },
      select: { username: true },
    });
    const endsIso = itemState?.auctionEndsAt?.toISOString() ?? null;
    const emitActiveItemChanged = !ctx.clutchTimeEnabled && Boolean(endsIso);
    const payload: LiveAuctionBidPlacedPayloadV1 = {
      v: LIVE_AUCTION_EVENT_PAYLOAD_VERSION,
      liveRoomId: ctx.liveRoomId,
      itemId: ctx.itemId,
      amountUsd: bidAmount,
      bidderId: proxy.userId,
      listingId: null,
      roomVersion: roomWrite.roomVersion,
      itemVersion: itemState?.itemVersion ?? null,
      auctionEndsAt: endsIso,
      biddingOpen: true,
      leadingBidderId: proxy.userId,
      leadingBidderUsername: leaderUserRow?.username ?? null,
      clutchTimeEnabled: ctx.clutchTimeEnabled,
      emitActiveItemChanged,
    };
    await tx.liveAuctionEvent.create({
      data: {
        liveRoomId: ctx.liveRoomId,
        seq: roomWrite.auctionEventSeq,
        eventType: "bid_placed",
        itemId: ctx.itemId,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
    await recordLiveRoomBid(tx, {
      liveRoomId: ctx.liveRoomId,
      liveRoomItemId: ctx.itemId,
      bidderId: proxy.userId,
      amountUsd: bidAmount,
      auctionEventSeq: roomWrite.auctionEventSeq,
      acceptedAt: now,
    });
  }
  return outbids;
}

export async function upsertLiveAuctionProxyBid(
  tx: Prisma.TransactionClient,
  input: {
    liveRoomId: string;
    liveRoomItemId: string;
    userId: string;
    maxAmountUsd: number;
    listingId: string | null;
  },
): Promise<void> {
  if (input.listingId) return;
  await tx.liveAuctionProxyBid.upsert({
    where: {
      liveRoomItemId_userId: { liveRoomItemId: input.liveRoomItemId, userId: input.userId },
    },
    create: {
      liveRoomId: input.liveRoomId,
      liveRoomItemId: input.liveRoomItemId,
      userId: input.userId,
      maxAmountUsd: input.maxAmountUsd,
    },
    update: { maxAmountUsd: input.maxAmountUsd, liveRoomId: input.liveRoomId },
  });
}
