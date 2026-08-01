import { NextResponse, after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getUnresolvedPaymentFailureForBuyer } from "@/lib/live-room-payment-failure";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { liveAuctionMinBidUsd } from "@/lib/auction";
import { placeListingBid } from "@/lib/place-listing-bid";
import { notifyAuctionOutbid } from "@/lib/notify-auction-outbid";
import { prisma } from "@/lib/prisma";
import { computeNextAuctionEndsAtAfterBid } from "@/lib/live-auction-bid-extension";
import { LIVE_AUCTION_EVENT_PAYLOAD_VERSION, type LiveAuctionBidPlacedPayloadV1 } from "@/lib/live-auction-event-schema";
import { flushPendingLiveAuctionFanout } from "@/lib/live-auction-fanout-flush";
import { logLiveAuctionRtDebug } from "@/lib/live-auction-rt-debug";
import { runLiveAuctionSpan } from "@/lib/live-auction-otel";
import { buildLiveBidAckItem } from "@/lib/live-bid-http-ack";
import { resolveLiveProxyBidChain, upsertLiveAuctionProxyBid } from "@/services/live-auction/resolve-live-proxy-bid-chain";
import { isStripeConfigured } from "@/lib/stripe";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { getLiveBuyerCommerceBlock, getLiveRoomBroadcastCommerceBlock } from "@/lib/live-room-commerce-guards";
import { getLiveRoomUserRestrictions } from "@/lib/trust/live-room-moderation";
import { getTransactionServerNow } from "@/lib/server-transaction-now";
import { recordLiveRoomBid } from "@/lib/record-live-room-bid";
import { resolveFinalDisplacedBidder } from "@/lib/live-bid-outbid-notify-target";
import {
  assertBidExceedsCurrentHigh,
  currentHighUsdFromLockedItem,
  isAuctionWindowEndedAt,
  lockActiveLiveRoomItemForBid,
} from "@/lib/live-room-bid-lock";
import { liveBidOutbidJsonBody } from "@/lib/live-bid-user-errors";

function signInUrl(returnPath: string) {
  return `/signin?returnTo=${encodeURIComponent(returnPath)}`;
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Fire-and-forget fan-out — never blocks the bidder HTTP ACK. */
function scheduleAuctionFanout(liveRoomId: string) {
  void flushPendingLiveAuctionFanout({ liveRoomId })
    .then((n) => logLiveAuctionRtDebug("bid flush done", { liveRoomId, published: n }))
    .catch((err) => console.error("[bid] fan-out flush", err));
  after(() => {
    void flushPendingLiveAuctionFanout({ liveRoomId }).catch((err) => console.error("[bid] fan-out flush", err));
  });
}

type Body = { amountUsd?: unknown; maxProxyUsd?: unknown };

function persistBidIdempotency(args: {
  userId: string;
  liveRoomId: string;
  itemId: string;
  key: string;
  statusCode: number;
  body: Record<string, unknown>;
}) {
  // Never block the bidder ACK on idempotency persistence.
  void prisma.liveBidIdempotency
    .create({
      data: {
        userId: args.userId,
        liveRoomId: args.liveRoomId,
        itemId: args.itemId,
        key: args.key,
        statusCode: args.statusCode,
        body: args.body as unknown as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  /** Stamp before any await so snipes aren't killed by preflight latency. */
  const receivedAt = new Date();
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const { id: rawRoom, itemId: rawItem } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const itemId = decodeURIComponent(rawItem);
  const returnPath = `/live/${encodeURIComponent(liveRoomId)}`;
  const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? "";

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const bidderId = auth.userId;
  const [room, item, commerceBlock, modRestrictions, wallet, cachedIdem, paymentFailure] = await Promise.all([
    prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: { id: true, sellerId: true, roomType: true, status: true, streamHealth: true, streamPaused: true, streamMode: true, streamStartedAt: true, streamEndedAt: true },
    }),
    prisma.liveRoomItem.findFirst({
      where: { id: itemId, liveRoomId },
      select: {
        id: true,
        title: true,
        listingId: true,
        status: true,
        currentBidUsd: true,
        startingBidUsd: true,
        priceUsd: true,
        bidIncrementUsd: true,
        biddingOpen: true,
        auctionEndsAt: true,
        clutchTimeEnabled: true,
        lastHighBidderId: true,
        auctionVariantId: true,
      },
    }),
    getLiveBuyerCommerceBlock({ liveRoomId, userId: bidderId }),
    getLiveRoomUserRestrictions({ liveRoomId, userId: bidderId }),
    isStripeConfigured() ? liveWalletIncompleteOrNull(bidderId) : Promise.resolve(null),
    idempotencyKey
      ? prisma.liveBidIdempotency.findFirst({
          where: { userId: bidderId, liveRoomId, itemId, key: idempotencyKey },
        })
      : Promise.resolve(null),
    getUnresolvedPaymentFailureForBuyer(liveRoomId, bidderId),
  ]);
  if (paymentFailure) {
    return NextResponse.json(
      {
        error: "Fix your failed payment before bidding, buying, or tipping in this show.",
        code: "LIVE_PAYMENT_BLOCKED",
        paymentFailure,
      },
      { status: 403 },
    );
  }
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  const variantSpotAuction = Boolean(item.auctionVariantId?.trim());
  if (room.roomType !== "auction" && room.roomType !== "break" && !(room.roomType === "sale" && variantSpotAuction)) {
    return NextResponse.json({ error: "Bidding is only available in auction or break live shows." }, { status: 400 });
  }
  // Host already opened bidding while room lifecycle lagged behind publish → heal to live.
  let roomStatus = room.status;
  if (roomStatus !== "live" && item.biddingOpen && room.streamPaused !== true) {
    const healed = await prisma.liveRoom.updateMany({
      where: { id: liveRoomId, status: { not: "live" } },
      data: { status: "live" },
    });
    if (healed.count > 0) roomStatus = "live";
  }
  if (roomStatus !== "live") {
    return NextResponse.json(
      { error: "This room is not live.", code: "ROOM_NOT_LIVE" },
      { status: 409 },
    );
  }
  const broadcastBlock = getLiveRoomBroadcastCommerceBlock({ ...room, status: roomStatus });
  if (broadcastBlock) {
    return NextResponse.json({ error: broadcastBlock.error, code: broadcastBlock.code }, { status: broadcastBlock.status });
  }

  if (item.status !== "active") {
    return NextResponse.json({ error: "Bidding is only open on the active item." }, { status: 409 });
  }
  if (!item.biddingOpen) {
    return NextResponse.json({ error: "The host has not started bidding on this lot yet." }, { status: 409 });
  }
  if (isAuctionWindowEndedAt(item.auctionEndsAt, receivedAt)) {
    return NextResponse.json({ error: "The bidding window for this lot has ended." }, { status: 409 });
  }

  if (commerceBlock) {
    return NextResponse.json({ error: commerceBlock.error, code: commerceBlock.code }, { status: commerceBlock.status });
  }

  if (modRestrictions.roomBanned || modRestrictions.kickedUntil) {
    return NextResponse.json({ error: "You cannot participate in this room." }, { status: 403 });
  }
  if (modRestrictions.bidBlocked) {
    return NextResponse.json({ error: "Bidding is disabled for your account in this room." }, { status: 403 });
  }

  const maxProxyRaw = body.maxProxyUsd;
  const maxProxyUsd =
    typeof maxProxyRaw === "number" && Number.isFinite(maxProxyRaw) ? maxProxyRaw : undefined;
  if (maxProxyUsd != null && item.listingId) {
    return NextResponse.json(
      { error: "Max proxy bids are not supported for marketplace listing lots in this release." },
      { status: 400 },
    );
  }

  if (cachedIdem) {
    return NextResponse.json(cachedIdem.body as Record<string, unknown>, { status: cachedIdem.statusCode });
  }

  if (wallet) {
    return NextResponse.json(wallet, { status: 402 });
  }

  try {
    return await runLiveAuctionSpan(
      "live_auction.bid.post",
      {
        "live.room_id": liveRoomId,
        "live.item_id": itemId,
        "live.has_listing": Boolean(item.listingId),
      },
      async () => {
    if (item.listingId) {
      const listingId = item.listingId;
      const meta = await prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          currentBidUsd: true,
          startingBidUsd: true,
          priceUsd: true,
        },
      });
      const currentHigh = meta?.currentBidUsd ?? meta?.startingBidUsd ?? meta?.priceUsd ?? 0;
      const minBid = liveAuctionMinBidUsd({
        currentBidUsd: currentHigh,
        startingBidUsd: meta?.startingBidUsd,
        priceUsd: meta?.priceUsd,
        lastHighBidderId: item.lastHighBidderId,
      });
      const amountUsd =
        typeof body.amountUsd === "number" && Number.isFinite(body.amountUsd) ? body.amountUsd : minBid;
      if (amountUsd < minBid) {
        return NextResponse.json(
          { error: `Bid must be at least ${formatMoney(minBid)}.` },
          { status: 400 },
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const now = await getTransactionServerNow(tx);
        const locked = await lockActiveLiveRoomItemForBid(tx, { liveRoomId, itemId, now, receivedAt });
        if (!locked.listingId || locked.listingId !== listingId) throw new Error("NOT_FOUND");
        const lockedHigh = currentHighUsdFromLockedItem(locked);
        const minBidLocked = liveAuctionMinBidUsd(locked);
        if (amountUsd < minBidLocked) throw new Error(`MIN_BID:${minBidLocked}`);
        assertBidExceedsCurrentHigh({
          bidderId,
          amountUsd,
          lastHighBidderId: locked.lastHighBidderId,
          currentHighUsd: lockedHigh,
        });
        const nextEndsAt = computeNextAuctionEndsAtAfterBid(now, locked.clutchTimeEnabled, locked.auctionEndsAt);
        const r = await placeListingBid(tx, { listingId, bidderId, amountUsd });
        await tx.liveRoomItem.update({
          where: { id: itemId },
          data: {
            currentBidUsd: r.amountUsd,
            lastHighBidderId: r.leaderBidderId ?? bidderId,
            ...(nextEndsAt ? { auctionEndsAt: nextEndsAt } : {}),
            itemVersion: { increment: 1 },
          },
        });
        const roomWrite = await tx.liveRoom.update({
          where: { id: liveRoomId },
          data: { roomVersion: { increment: 1 }, auctionEventSeq: { increment: 1 } },
          select: { roomVersion: true, auctionEventSeq: true },
        });
        const itemState = await tx.liveRoomItem.findUnique({
          where: { id: itemId },
          select: { itemVersion: true, auctionEndsAt: true },
        });
        const leaderId = r.leaderBidderId ?? bidderId;
        const leaderUserRow = await tx.user.findUnique({
          where: { id: leaderId },
          select: { username: true },
        });
        const endsIso = itemState?.auctionEndsAt?.toISOString() ?? null;
        const emitActiveItemChanged = !locked.clutchTimeEnabled && Boolean(endsIso);
        const payload: LiveAuctionBidPlacedPayloadV1 = {
          v: LIVE_AUCTION_EVENT_PAYLOAD_VERSION,
          liveRoomId,
          itemId,
          amountUsd: r.amountUsd,
          bidderId,
          listingId,
          roomVersion: roomWrite.roomVersion,
          itemVersion: itemState?.itemVersion ?? null,
          auctionEndsAt: endsIso,
          biddingOpen: true,
          leadingBidderId: leaderId,
          leadingBidderUsername: leaderUserRow?.username ?? null,
          clutchTimeEnabled: locked.clutchTimeEnabled,
          emitActiveItemChanged,
        };
        await tx.liveAuctionEvent.create({
          data: {
            liveRoomId,
            seq: roomWrite.auctionEventSeq,
            eventType: "bid_placed",
            itemId,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
        return {
          ...r,
          roomVersion: roomWrite.roomVersion,
          auctionSeq: roomWrite.auctionEventSeq,
          itemVersion: itemState?.itemVersion ?? 0,
          auctionEndsAt: endsIso,
          leaderId,
          leaderUsername: leaderUserRow?.username ?? null,
          startingBidUsd: locked.startingBidUsd,
          clutchTimeEnabled: locked.clutchTimeEnabled,
        };
      });

      if (result.prevLeaderId && result.prevLeaderId !== bidderId) {
        queueMicrotask(() => {
          void notifyAuctionOutbid(prisma, {
            outbidUserId: result.prevLeaderId!,
            amountUsd: result.amountUsd,
            title: result.listingTitle,
            href: `/marketplace/${encodeURIComponent(listingId)}`,
          });
        });
      }

      logLiveAuctionRtDebug("bid accepted listing", {
        liveRoomId,
        itemId,
        listingId,
        auctionSeq: result.auctionSeq,
        bidderId,
      });
      scheduleAuctionFanout(liveRoomId);
      const itemDto = buildLiveBidAckItem({
        itemId,
        itemVersion: result.itemVersion,
        currentBidUsd: result.amountUsd,
        startingBidUsd: result.startingBidUsd,
        lastHighBidderId: result.leaderId,
        lastHighBidderUsername: result.leaderUsername,
        auctionEndsAt: result.auctionEndsAt,
        clutchTimeEnabled: result.clutchTimeEnabled,
      });

      const serverNowMs = Date.now();
      const jsonBody = {
        ok: true as const,
        serverNowMs,
        roomVersion: result.roomVersion,
        auctionSeq: result.auctionSeq,
        item: itemDto,
      };
      if (idempotencyKey) {
        persistBidIdempotency({
          userId: bidderId,
          liveRoomId,
          itemId,
          key: idempotencyKey,
          statusCode: 200,
          body: jsonBody,
        });
      }
      return NextResponse.json(jsonBody);
    }

    const minBid = liveAuctionMinBidUsd(item);
    const amountUsd =
      typeof body.amountUsd === "number" && Number.isFinite(body.amountUsd) ? body.amountUsd : minBid;
    if (amountUsd < minBid) {
      return NextResponse.json({ error: `Bid must be at least ${formatMoney(minBid)}.` }, { status: 400 });
    }

    const prevLeaderId = item.lastHighBidderId;
    const state = await prisma.$transaction(async (tx) => {
      const now = await getTransactionServerNow(tx);
      const locked = await lockActiveLiveRoomItemForBid(tx, { liveRoomId, itemId, now, receivedAt });
      const lockedHigh = currentHighUsdFromLockedItem(locked);
      const minBidLocked = liveAuctionMinBidUsd(locked);
      if (amountUsd < minBidLocked) throw new Error(`MIN_BID:${minBidLocked}`);
      assertBidExceedsCurrentHigh({
        bidderId,
        amountUsd,
        lastHighBidderId: locked.lastHighBidderId,
        currentHighUsd: lockedHigh,
      });
      const nextEndsAt = computeNextAuctionEndsAtAfterBid(now, locked.clutchTimeEnabled, locked.auctionEndsAt);
      await tx.liveRoomItem.update({
        where: { id: itemId },
        data: {
          currentBidUsd: amountUsd,
          lastHighBidderId: bidderId,
          ...(nextEndsAt ? { auctionEndsAt: nextEndsAt } : {}),
          itemVersion: { increment: 1 },
        },
      });
      const roomWrite = await tx.liveRoom.update({
        where: { id: liveRoomId },
        data: { roomVersion: { increment: 1 }, auctionEventSeq: { increment: 1 } },
        select: { roomVersion: true, auctionEventSeq: true },
      });
      const itemState = await tx.liveRoomItem.findUnique({
        where: { id: itemId },
        select: { itemVersion: true, auctionEndsAt: true },
      });
      const bidder = await tx.user.findUnique({ where: { id: bidderId }, select: { username: true } });
      const endsIso = itemState?.auctionEndsAt?.toISOString() ?? null;
      const emitActiveItemChanged = !locked.clutchTimeEnabled && Boolean(endsIso);
      const payload: LiveAuctionBidPlacedPayloadV1 = {
        v: LIVE_AUCTION_EVENT_PAYLOAD_VERSION,
        liveRoomId,
        itemId,
        amountUsd,
        bidderId,
        listingId: locked.listingId,
        roomVersion: roomWrite.roomVersion,
        itemVersion: itemState?.itemVersion ?? null,
        auctionEndsAt: endsIso,
        biddingOpen: true,
        leadingBidderId: bidderId,
        leadingBidderUsername: bidder?.username ?? null,
        clutchTimeEnabled: locked.clutchTimeEnabled,
        emitActiveItemChanged,
      };
      await tx.liveAuctionEvent.create({
        data: {
          liveRoomId,
          seq: roomWrite.auctionEventSeq,
          eventType: "bid_placed",
          itemId,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      await recordLiveRoomBid(tx, {
        liveRoomId,
        liveRoomItemId: itemId,
        bidderId,
        amountUsd,
        auctionEventSeq: roomWrite.auctionEventSeq,
        acceptedAt: now,
        idempotencyKey: idempotencyKey || undefined,
      });
      if (!item.listingId) {
        const effectiveMaxProxyUsd = maxProxyUsd ?? amountUsd;
        if (effectiveMaxProxyUsd + 0.001 < amountUsd) throw new Error("PROXY_MAX_LT_BID");
        await upsertLiveAuctionProxyBid(tx, {
          liveRoomId,
          liveRoomItemId: itemId,
          userId: bidderId,
          maxAmountUsd: effectiveMaxProxyUsd,
          listingId: null,
        });
      }
      const proxyOutbids = await resolveLiveProxyBidChain(tx, {
        liveRoomId,
        itemId,
        clutchTimeEnabled: locked.clutchTimeEnabled,
        listingId: locked.listingId,
      });
      const roomFinal = await tx.liveRoom.findUnique({
        where: { id: liveRoomId },
        select: { roomVersion: true, auctionEventSeq: true },
      });
      if (!roomFinal) throw new Error("ROOM_MISSING");
      const itemFinal = await tx.liveRoomItem.findUnique({
        where: { id: itemId },
        select: { itemVersion: true, auctionEndsAt: true, lastHighBidderId: true, currentBidUsd: true },
      });
      const leaderIdFinal = itemFinal?.lastHighBidderId ?? bidderId;
      const leaderUserFinal = await tx.user.findUnique({
        where: { id: leaderIdFinal },
        select: { username: true },
      });
      const endsIsoFinal = itemFinal?.auctionEndsAt?.toISOString() ?? null;
      return {
        roomVersion: roomFinal.roomVersion,
        auctionSeq: roomFinal.auctionEventSeq,
        itemVersion: itemFinal?.itemVersion ?? 0,
        auctionEndsAt: endsIsoFinal,
        leaderId: leaderIdFinal,
        leaderUsername: leaderUserFinal?.username ?? null,
        startingBidUsd: locked.startingBidUsd,
        clutchTimeEnabled: locked.clutchTimeEnabled,
        proxyOutbids,
        finalHighUsd: itemFinal?.currentBidUsd ?? amountUsd,
      };
    });

    // Notify only the single bidder displaced by the final settled outcome of this
    // bid-processing cycle, not every intermediate leader in the proxy-bid chain.
    const displaced = resolveFinalDisplacedBidder({
      prevLeaderId,
      bidderId,
      proxyOutbids: state.proxyOutbids,
      finalHighUsd: state.finalHighUsd,
    });
    const liveHref = `/live/${encodeURIComponent(liveRoomId)}`;
    if (displaced) {
      queueMicrotask(() => {
        void notifyAuctionOutbid(prisma, {
          outbidUserId: displaced.userId,
          amountUsd: displaced.amountUsd,
          title: item.title,
          href: liveHref,
        });
      });
    }

    logLiveAuctionRtDebug("bid accepted host", {
      liveRoomId,
      itemId,
      auctionSeq: state.auctionSeq,
      bidderId,
    });
    scheduleAuctionFanout(liveRoomId);
    const itemDto = buildLiveBidAckItem({
      itemId,
      itemVersion: state.itemVersion,
      currentBidUsd: state.finalHighUsd,
      startingBidUsd: state.startingBidUsd,
      lastHighBidderId: state.leaderId,
      lastHighBidderUsername: state.leaderUsername,
      auctionEndsAt: state.auctionEndsAt,
      clutchTimeEnabled: state.clutchTimeEnabled,
    });

    const serverNowMs = Date.now();
    const jsonBody = {
      ok: true as const,
      serverNowMs,
      roomVersion: state.roomVersion,
      auctionSeq: state.auctionSeq,
      item: itemDto,
    };
    if (idempotencyKey) {
      persistBidIdempotency({
        userId: bidderId,
        liveRoomId,
        itemId,
        key: idempotencyKey,
        statusCode: 200,
        body: jsonBody,
      });
    }
    return NextResponse.json(jsonBody);
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    if (msg === "NOT_AUCTION") return NextResponse.json({ error: "This listing is not an auction." }, { status: 400 });
    if (msg === "NOT_OPEN") return NextResponse.json({ error: "This auction is not open for bids." }, { status: 409 });
    if (msg === "OWN_LISTING") {
      return NextResponse.json({ error: "You cannot bid on your own listing." }, { status: 400 });
    }
    if (msg === "ENDED") return NextResponse.json({ error: "Auction has ended" }, { status: 409 });
    if (msg === "ITEM_NOT_FOUND") return NextResponse.json({ error: "Item not found." }, { status: 404 });
    if (msg === "ITEM_NOT_ACTIVE") {
      return NextResponse.json({ error: "Bidding is only open on the active item." }, { status: 409 });
    }
    if (msg === "BIDDING_NOT_OPEN") {
      return NextResponse.json({ error: "The host has not started bidding on this lot yet." }, { status: 409 });
    }
    if (msg === "ALREADY_HIGH_BIDDER") {
      return NextResponse.json({ error: "You are already the high bidder at this amount." }, { status: 409 });
    }
    if (msg === "CONCURRENT_HIGHER_BID") {
      return NextResponse.json(liveBidOutbidJsonBody({ formatMoney }), { status: 409 });
    }
    if (msg === "PROXY_MAX_LT_BID") {
      return NextResponse.json({ error: "Max proxy bid must be at least your current bid amount." }, { status: 400 });
    }
    if (msg.startsWith("MIN_BID:")) {
      const min = Number(msg.slice("MIN_BID:".length));
      return NextResponse.json(
        liveBidOutbidJsonBody({
          minNextBidUsd: Number.isFinite(min) ? min : undefined,
          formatMoney,
        }),
        { status: 409 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: "We couldn't place that bid. Try again in a moment." }, { status: 500 });
  }
}
