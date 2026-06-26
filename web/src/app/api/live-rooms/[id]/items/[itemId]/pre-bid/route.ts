import { NextResponse } from "next/server";
import { liveRoomPaymentBlockResponse } from "@/lib/live-room-payment-failure";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import {
  isLiveAuctionPreBidEligible,
  liveAuctionPreBidMinUsd,
  placeLiveAuctionPreBid,
} from "@/lib/live-auction-pre-bid";
import { getLiveBuyerCommerceBlock } from "@/lib/live-room-commerce-guards";
import { getLiveRoomUserRestrictions } from "@/lib/trust/live-room-moderation";
import { getLiveRoomItemSnapshotDto } from "@/lib/live-room-item-snapshot-server";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";

type Body = { amountUsd?: unknown };

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Buyer pre-bid before the host starts the live auction timer (host lots only). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: rawRoom, itemId: rawItem } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const itemId = decodeURIComponent(rawItem);

  const paymentBlock = await liveRoomPaymentBlockResponse(liveRoomId, auth.userId);
  if (paymentBlock) return paymentBlock;

  const [room, item] = await Promise.all([
    prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: { id: true, sellerId: true, roomType: true, status: true },
    }),
    prisma.liveRoomItem.findFirst({
      where: { id: itemId, liveRoomId },
      select: {
        id: true,
        status: true,
        salesFormat: true,
        listingId: true,
        biddingOpen: true,
        startingBidUsd: true,
        currentBidUsd: true,
        lastHighBidderId: true,
        bidIncrementUsd: true,
      },
    }),
  ]);

  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (room.status !== "live") {
    return NextResponse.json({ error: "This room is not live." }, { status: 409 });
  }
  if (room.roomType !== "auction" && room.roomType !== "sale" && room.roomType !== "break") {
    return NextResponse.json({ error: "Pre-bids are not available in this room type." }, { status: 400 });
  }
  if (!isLiveAuctionPreBidEligible(item)) {
    return NextResponse.json({ error: "This lot is not open for pre-bids." }, { status: 409 });
  }

  const commerceBlock = await getLiveBuyerCommerceBlock({ liveRoomId, userId: auth.userId });
  if (commerceBlock) {
    return NextResponse.json({ error: commerceBlock.error, code: commerceBlock.code }, { status: commerceBlock.status });
  }

  const modRestrictions = await getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId });
  if (modRestrictions.roomBanned || modRestrictions.kickedUntil || modRestrictions.bidBlocked) {
    return NextResponse.json({ error: "You cannot bid in this room." }, { status: 403 });
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(auth.userId);
    if (wallet) return NextResponse.json(wallet, { status: 402 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const amountUsd = typeof body.amountUsd === "number" && Number.isFinite(body.amountUsd) ? body.amountUsd : NaN;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return NextResponse.json({ error: "amountUsd must be a positive number." }, { status: 400 });
  }

  const minUsd = liveAuctionPreBidMinUsd(item);
  if (amountUsd + 0.001 < minUsd) {
    return NextResponse.json(
      { error: `Pre-bid must be at least ${formatMoney(minUsd)}.` },
      { status: 400 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await placeLiveAuctionPreBid(tx, {
        liveRoomId,
        item,
        userId: auth.userId,
        amountUsd,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "PRE_BID_TOO_LOW") {
      return NextResponse.json({ error: `Pre-bid must be at least ${formatMoney(minUsd)}.` }, { status: 400 });
    }
    console.error("[live-room pre-bid]", e);
    return NextResponse.json({ error: "Could not place pre-bid." }, { status: 500 });
  }

  emitLiveRoomQueueItemsChanged(liveRoomId);
  const itemDto = await getLiveRoomItemSnapshotDto(itemId);
  return NextResponse.json({ ok: true, amountUsd, item: itemDto });
}
