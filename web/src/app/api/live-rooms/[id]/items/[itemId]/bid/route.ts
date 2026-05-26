import { NextResponse, after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { resolveLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { liveAuctionMinBidUsd, minNextBidUsd } from "@/lib/auction";
import { placeListingBid } from "@/lib/place-listing-bid";
import { notifyAuctionOutbid } from "@/lib/notify-auction-outbid";
import { prisma } from "@/lib/prisma";
import { computeNextAuctionEndsAtAfterBid } from "@/lib/live-auction-bid-extension";
import { LIVE_AUCTION_EVENT_PAYLOAD_VERSION, type LiveAuctionBidPlacedPayloadV1 } from "@/lib/live-auction-event-schema";
import { flushPendingLiveAuctionFanout } from "@/lib/live-auction-fanout-flush";
import { logLiveAuctionRtDebug } from "@/lib/live-auction-rt-debug";
import { runLiveAuctionSpan } from "@/lib/live-auction-otel";
import { getLiveRoomItemSnapshotDto } from "@/lib/live-room-item-snapshot-server";
import { resolveLiveProxyBidChain, upsertLiveAuctionProxyBid } from "@/services/live-auction/resolve-live-proxy-bid-chain";
import { isStripeConfigured } from "@/lib/stripe";
import { liveWalletIncompleteOrNull } from "@/lib/buyer-live-wallet-readiness";
import { getLiveRoomUserRestrictions } from "@/lib/trust/live-room-moderation";
import { getTransactionServerNow, getServerNow } from "@/lib/server-transaction-now";
import { recordLiveRoomBid } from "@/lib/record-live-room-bid";
import {
  assertBidExceedsCurrentHigh,
  currentHighUsdFromLockedItem,
  lockActiveLiveRoomItemForBid,
} from "@/lib/live-room-bid-lock";

function signInUrl(returnPath: string) {
  return `/signin?returnTo=${encodeURIComponent(returnPath)}`;
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function scheduleAuctionFanout(liveRoomId: string) {
  after(() => {
    void flushPendingLiveAuctionFanout({ liveRoomId }).catch((err) => console.error("[bid] fan-out flush", err));
  });
}

/** Runs compat realtime + `publishedAt` before returning the bid HTTP response; sidecars never block this path. */
async function flushAuctionFanoutForRoom(liveRoomId: string): Promise<void> {
  try {
    const n = await flushPendingLiveAuctionFanout({ liveRoomId });
    logLiveAuctionRtDebug("bid flush done", { liveRoomId, published: n });
  } catch (e) {
    console.error("[bid] fan-out flush", e);
    logLiveAuctionRtDebug("bid flush error", { liveRoomId, err: String(e) });
    scheduleAuctionFanout(liveRoomId);
  }
}

type Body = { amountUsd?: unknown; maxProxyUsd?: unknown };

export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;
  const { id: rawRoom, itemId: rawItem } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);
  const itemId = decodeURIComponent(rawItem);
  const returnPath = `/live/${encodeURIComponent(liveRoomId)}`;
  const idempotencyKey = req.headers.get("idempotency-key")?.trim() ?? "";

  const [room, item] = await Promise.all([
    prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      select: { id: true, sellerId: true, roomType: true, status: true },
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
        biddingOpen: true,
        auctionEndsAt: true,
        clutchTimeEnabled: true,
        lastHighBidderId: true,
      },
    }),
  ]);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (room.roomType !== "auction" && room.roomType !== "break") {
    return NextResponse.json({ error: "Bidding is only available in auction or break live shows." }, { status: 400 });
  }
  if (room.status !== "live") {
    return NextResponse.json({ error: "This room is not live." }, { status: 409 });
  }

  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (item.status !== "active") {
    return NextResponse.json({ error: "Bidding is only open on the active item." }, { status: 409 });
  }
  if (!item.biddingOpen) {
    return NextResponse.json({ error: "The host has not started bidding on this lot yet." }, { status: 409 });
  }
  const preflightNow = await getServerNow(prisma);
  if (item.auctionEndsAt && item.auctionEndsAt <= preflightNow) {
    return NextResponse.json({ error: "The bidding window for this lot has ended." }, { status: 409 });
  }

  if (room.sellerId === auth.userId) {
    return NextResponse.json({ error: "You cannot bid on items in your own live room." }, { status: 400 });
  }

  const modRestrictions = await getLiveRoomUserRestrictions({ liveRoomId, userId: auth.userId });
  if (modRestrictions.roomBanned || modRestrictions.kickedUntil) {
    return NextResponse.json({ error: "You cannot participate in this room." }, { status: 403 });
  }
  if (modRestrictions.bidBlocked) {
    return NextResponse.json({ error: "Bidding is disabled for your account in this room." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
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

  const bidderId = auth.userId;

  if (idempotencyKey) {
    const cached = await prisma.liveBidIdempotency.findFirst({
      where: { userId: bidderId, liveRoomId, itemId, key: idempotencyKey },
    });
    if (cached) {
      return NextResponse.json(cached.body as Record<string, unknown>, { status: cached.statusCode });
    }
  }

  if (isStripeConfigured()) {
    const wallet = await liveWalletIncompleteOrNull(bidderId);
    if (wallet) {
      return NextResponse.json(wallet, { status: 402 });
    }
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
        const locked = await lockActiveLiveRoomItemForBid(tx, { liveRoomId, itemId, now });
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
          itemVersion: itemState?.itemVersion,
          auctionEndsAt: endsIso,
          leaderUsername: leaderUserRow?.username ?? null,
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
      const [, itemDto] = await Promise.all([flushAuctionFanoutForRoom(liveRoomId), getLiveRoomItemSnapshotDto(itemId)]);
      scheduleAuctionFanout(liveRoomId);

      const serverNowMs = Date.now();
      const jsonBody = {
        ok: true as const,
        serverNowMs,
        roomVersion: result.roomVersion,
        auctionSeq: result.auctionSeq,
        item: itemDto,
      };
      if (idempotencyKey) {
        await prisma.liveBidIdempotency
          .create({
            data: {
              userId: bidderId,
              liveRoomId,
              itemId,
              key: idempotencyKey,
              statusCode: 200,
              body: jsonBody as unknown as Prisma.InputJsonValue,
            },
          })
          .catch(() => {});
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
      const locked = await lockActiveLiveRoomItemForBid(tx, { liveRoomId, itemId, now });
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
      if (maxProxyUsd != null) {
        if (maxProxyUsd < amountUsd) throw new Error("PROXY_MAX_LT_BID");
        await upsertLiveAuctionProxyBid(tx, {
          liveRoomId,
          liveRoomItemId: itemId,
          userId: bidderId,
          maxAmountUsd: maxProxyUsd,
          listingId: item.listingId,
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
        itemVersion: itemFinal?.itemVersion ?? null,
        auctionEndsAt: endsIsoFinal,
        leaderUsername: leaderUserFinal?.username ?? null,
        proxyOutbids,
        finalHighUsd: itemFinal?.currentBidUsd ?? amountUsd,
      };
    });

    const outbidTargets = new Map<string, number>();
    if (prevLeaderId && prevLeaderId !== bidderId) {
      outbidTargets.set(prevLeaderId, amountUsd);
    }
    for (const o of state.proxyOutbids) {
      outbidTargets.set(o.userId, o.amountUsd);
    }
    const liveHref = `/live/${encodeURIComponent(liveRoomId)}`;
    for (const [outbidUserId, amt] of outbidTargets) {
      queueMicrotask(() => {
        void notifyAuctionOutbid(prisma, {
          outbidUserId,
          amountUsd: amt,
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
    const [, itemDto] = await Promise.all([flushAuctionFanoutForRoom(liveRoomId), getLiveRoomItemSnapshotDto(itemId)]);
    scheduleAuctionFanout(liveRoomId);

    const serverNowMs = Date.now();
    const jsonBody = {
      ok: true as const,
      serverNowMs,
      roomVersion: state.roomVersion,
      auctionSeq: state.auctionSeq,
      item: itemDto,
    };
    if (idempotencyKey) {
      await prisma.liveBidIdempotency
        .create({
          data: {
            userId: bidderId,
            liveRoomId,
            itemId,
            key: idempotencyKey,
            statusCode: 200,
            body: jsonBody as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => {});
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
      return NextResponse.json({ error: "Another higher bid was placed. Try the next amount." }, { status: 409 });
    }
    if (msg === "PROXY_MAX_LT_BID") {
      return NextResponse.json({ error: "Max proxy bid must be at least your current bid amount." }, { status: 400 });
    }
    if (msg.startsWith("MIN_BID:")) {
      const min = Number(msg.slice("MIN_BID:".length));
      return NextResponse.json(
        { error: `Bid must be at least ${formatMoney(Number.isFinite(min) ? min : 0)}.` },
        { status: 400 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: "Could not place bid." }, { status: 500 });
  }
}
