import { NextResponse } from "next/server";
import { listViewerGiveawaysForRoom } from "@/lib/live-giveaway";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveLiveRoomsUserId, resolveOptionalLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { attachHighBidderUsernames } from "@/lib/live-room-high-bidder-enrich";
import { buildLiveRoomDetail } from "@/lib/live-room-serialize";
import { enrichLiveRoomDetailRandomClaims } from "@/lib/live-variant-random-claims";
import { liveRoomItemsWithVariantsInclude } from "@/lib/live-item-variant-include";
import { logLiveLoaderDebug, safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import { getBuyerLiveWalletReadiness } from "@/lib/buyer-live-wallet-readiness";
import { getLiveBuyerPaymentSessionState } from "@/lib/live-payment-pipeline";
import {
  getUnresolvedPaymentFailureForBuyer,
  listUnresolvedPaymentFailuresForRoom,
} from "@/lib/live-room-payment-failure";
import { notifyFollowersSellerWentLive } from "@/lib/seller-follow-notify";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";
import { processAuctionPaymentExpiries } from "@/services/payments";
import {
  finalizeOverdueLiveAuctionLotsForRoom,
  LIVE_AUCTION_AUTO_CLOSE_GRACE_MS,
} from "@/lib/live-auction-finalize";
import { emitAuctionEnded, emitAuctionStarted, emitLiveDiscoveryChanged, emitTeamBoardChanged } from "@/lib/realtime-emit-server";
import { buildLiveTipRoomData } from "@/lib/live-tip-moderator";
import { serializeLiveTipConfig } from "@/lib/live-tip-routing";
import { finalizeLiveStreamReplay } from "@/lib/trust/live-replay-service";
import { endHostStageSession } from "@/services/ivs";
import { logSellerRoomStateSnapshot } from "@/lib/log-room-state-snapshot";
import { computeBreakBuyerPhase } from "@/lib/live-room-break-public";

const includeDetail = {
  seller: { select: { id: true, username: true } as const },
  tipModerator: { select: { id: true, username: true } as const },
  items: liveRoomItemsWithVariantsInclude,
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" as const },
    take: 200,
    include: { sender: { select: { username: true, image: true } as const } },
  },
  breakSpots: {
    orderBy: { createdAt: "asc" as const },
    include: { user: { select: { username: true } as const } },
  },
  breakHits: {
    orderBy: { createdAt: "desc" as const },
    take: 40,
    include: { buyer: { select: { username: true } as const } },
  },
} as const;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const id = safeDecodeRouteSegment(raw ?? "");
  const viewerId = await resolveOptionalLiveRoomsUserId(req);

  try {
  if (viewerId) {
    try {
      await processAuctionPaymentExpiries();
    } catch (e) {
      console.error("[api/live-rooms/[id]] processAuctionPaymentExpiries", e);
    }
  }

  let room = await prisma.liveRoom.findUnique({
    where: { id },
    include: includeDetail,
  });
  if (!room) {
    logLiveLoaderDebug("api_live_rooms_get_not_found", {
      liveRoomId: id,
      idParamRaw: raw,
      sessionUserId: viewerId,
    });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Server-authoritative auto-close: if any active lot's timer has elapsed, finalize it (settle +
  // charge winner, or close unsold) before serializing — so the auction does not depend on the
  // host pressing Close or on any client countdown. Idempotent; only fires when a lot is overdue.
  if (room.status === "live" && (room.roomType === "auction" || room.roomType === "break")) {
    const nowMs = Date.now();
    const hasOverdue = room.items.some(
      (it) => it.status === "active" && it.biddingOpen && it.auctionEndsAt != null
        && it.auctionEndsAt.getTime() <= nowMs - LIVE_AUCTION_AUTO_CLOSE_GRACE_MS,
    );
    if (hasOverdue) {
      try {
        await finalizeOverdueLiveAuctionLotsForRoom({
          liveRoomId: id,
          room: { sellerId: room.sellerId, roomType: room.roomType, roomVersion: room.roomVersion },
          nowMs,
          trigger: "read_sweep",
        });
        const reloaded = await prisma.liveRoom.findUnique({ where: { id }, include: includeDetail });
        if (reloaded) room = reloaded;
      } catch (e) {
        console.error("[api/live-rooms/[id]] finalizeOverdueLiveAuctionLots", e);
      }
    }
  }

  const seller = await prisma.user.findUnique({
    where: { id: room.sellerId },
    select: { email: true },
  });
  let isAdmin = false;
  if (viewerId) {
    const actor = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true },
    });
    isAdmin = actor?.role === "admin";
  }
  let isHost = viewerId === room.sellerId;
  if (!isHost && viewerId) {
    const actor = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { email: true },
    });
    const actorEmail = actor?.email?.trim().toLowerCase();
    const sellerEmail = seller?.email?.trim().toLowerCase();
    isHost = Boolean(actorEmail && sellerEmail && actorEmail === sellerEmail);
  }
  if (isHiddenFixtureSellerEmail(seller?.email) && !isHost && !isAdmin) {
    logLiveLoaderDebug("api_live_rooms_get_hidden_fixture", {
      liveRoomId: id,
      sessionUserId: viewerId,
      isHost,
      isAdmin,
    });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const serverNowMs = Date.now();
  const detail = buildLiveRoomDetail(room);
  if (!viewerId || isHost) {
    detail.buyerLiveBidPaymentReady = true;
    detail.buyerLiveShippingReady = true;
    detail.buyerLivePayment = {
      liveRoomPaymentReady: true,
      paymentReady: true,
      shippingReady: true,
      activePaymentMethodId: null,
      preauthorizationStatus: "none",
      paymentFailureState: null,
    };
  } else {
    const w = await getBuyerLiveWalletReadiness(viewerId);
    detail.buyerLiveBidPaymentReady = w.paymentReady;
    detail.buyerLiveShippingReady = w.shippingReady;
    detail.buyerLivePayment = await getLiveBuyerPaymentSessionState({
      buyerId: viewerId,
      liveRoomId: id,
    });
    detail.buyerUnresolvedPaymentFailure = await getUnresolvedPaymentFailureForBuyer(id, viewerId);
  }
  if (isHost && viewerId) {
    detail.sellerUnresolvedPaymentFailures = await listUnresolvedPaymentFailuresForRoom(id);
  }
  detail.items = await attachHighBidderUsernames(detail.items);
  const activeId = detail.activeItem?.id ?? null;
  detail.activeItem = activeId ? detail.items.find((i) => i.id === activeId) ?? null : null;
  const enriched = await enrichLiveRoomDetailRandomClaims(detail);
  enriched.giveaways = await listViewerGiveawaysForRoom(id, viewerId);
  logSellerRoomStateSnapshot({
    source: "buyer-room-get",
    roomId: id,
    roomStatus: enriched.status,
    roomType: enriched.roomType,
    activeItem: enriched.activeItem,
    overlayItem: enriched.activeItem,
    breakPhase:
      enriched.roomType === "break" && enriched.break
        ? enriched.break.phase
        : room.roomType === "break"
          ? computeBreakBuyerPhase(room, room.breakSpots?.length ?? 0)
          : null,
    lockPurchases: enriched.break?.lockPurchases,
    breakPaused: enriched.break?.breakPaused,
    serverNowMs,
    extra: { viewerId: viewerId ?? null, isHost },
  });
  return NextResponse.json({ room: enriched, serverNowMs });
  } catch (e) {
    console.error("[api GET /api/live-rooms/[id]] failed", { liveRoomId: id, viewerId, e });
    return NextResponse.json(
      { error: "Could not load live room.", code: "LIVE_ROOM_GET_FAILED" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

type PatchBody = {
  title?: string;
  description?: string;
  scheduledStartAt?: string | null;
  thumbnailUrl?: string;
  action?: string;
  tipModeratorId?: string | null;
  tipRecipientMode?: string;
  tipsToModerator?: boolean;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await resolveLiveRoomsUserId(req);
  if (auth instanceof NextResponse) return auth;

  const { id: raw } = await ctx.params;
  const id = safeDecodeRouteSegment(raw ?? "");

  const existing = await prisma.liveRoom.findUnique({
    where: { id },
    select: { id: true, sellerId: true, status: true, roomType: true, teamBoardLeague: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const actor = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  const isAdmin = actor?.role === "admin";
  if (existing.sellerId !== auth.userId && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (action === "start") {
    if (existing.status === "ended") {
      return NextResponse.json({ error: "Room already ended." }, { status: 409 });
    }
    if (existing.status === "live") {
      return NextResponse.json({ error: "Room is already live." }, { status: 409 });
    }
    const readiness = await getSellerLiveReadiness(existing.sellerId);
    if (!readiness.canGoLive) {
      return NextResponse.json(
        {
          error: "Complete seller setup before going live.",
          issues: readiness.issues,
          checks: readiness.checks,
        },
        { status: 400 },
      );
    }
    const started = await prisma.liveRoom.updateMany({
      where: { id, status: "scheduled" },
      data: {
        status: "live",
        startedAt: new Date(),
        endedAt: null,
        completedSalesGmvUsd: 0,
        roomVersion: { increment: 1 },
      },
    });
    if (started.count === 0) {
      return NextResponse.json({ error: "Room state changed. Refresh and try again." }, { status: 409 });
    }
    const roomNow = await prisma.liveRoom.findUnique({ where: { id }, select: { roomVersion: true } });
    if (existing.roomType === "break") {
      await prisma.liveRoomTeamBoard.upsert({
        where: { liveRoomId: id },
        create: {
          liveRoomId: id,
          league: existing.teamBoardLeague,
          visible: true,
          locked: false,
        },
        update: { visible: true },
      });
      void emitTeamBoardChanged(id);
    }
    emitAuctionStarted(id, roomNow?.roomVersion);
    const seller = await prisma.user.findUnique({
      where: { id: existing.sellerId },
      select: { username: true },
    });
    if (seller) {
      await notifyFollowersSellerWentLive(existing.sellerId, seller.username, id);
    }
    emitLiveDiscoveryChanged({ roomId: id, status: "live", reason: "started" });
    return NextResponse.json({ ok: true });
  }

  if (action === "end") {
    if (existing.status !== "live") {
      return NextResponse.json({ error: "Room is not live." }, { status: 409 });
    }
    const ended = await prisma.liveRoom.updateMany({
      where: { id, status: "live" },
      data: {
        status: "ended",
        endedAt: new Date(),
        completedSalesGmvUsd: 0,
        roomVersion: { increment: 1 },
      },
    });
    if (ended.count === 0) {
      return NextResponse.json({ error: "Room state changed. Refresh and try again." }, { status: 409 });
    }
    const roomNow = await prisma.liveRoom.findUnique({ where: { id }, select: { roomVersion: true } });
    emitAuctionEnded(id, roomNow?.roomVersion);
    emitLiveDiscoveryChanged({ roomId: id, status: "ended", reason: "ended" });
    // Tear down the WebRTC Stage HLS mirror + mark stream ended so composition cost stops with the show.
    void endHostStageSession(id).catch((e) => console.error("[live-room end] stage teardown", e));
    void finalizeLiveStreamReplay(id).catch((e) => console.error("[live-room end] replay", e));
    return NextResponse.json({ ok: true });
  }

  /** End a scheduled (or live) show — removes it from public live discovery. */
  if (action === "cancel") {
    if (existing.status === "ended") {
      return NextResponse.json({ ok: true });
    }
    const ended = await prisma.liveRoom.updateMany({
      where: { id, status: { in: ["scheduled", "live"] } },
      data: {
        status: "ended",
        endedAt: new Date(),
        completedSalesGmvUsd: 0,
        roomVersion: { increment: 1 },
      },
    });
    if (ended.count === 0) {
      return NextResponse.json({ error: "Room state changed. Refresh and try again." }, { status: 409 });
    }
    const roomNow = await prisma.liveRoom.findUnique({ where: { id }, select: { roomVersion: true } });
    if (existing.status === "live") {
      emitAuctionEnded(id, roomNow?.roomVersion);
    }
    emitLiveDiscoveryChanged({ roomId: id, status: "ended", reason: "cancelled" });
    void endHostStageSession(id).catch((e) => console.error("[live-room cancel] stage teardown", e));
    void finalizeLiveStreamReplay(id).catch((e) => console.error("[live-room cancel] replay", e));
    return NextResponse.json({ ok: true });
  }

  const data: {
    title?: string;
    description?: string;
    thumbnailUrl?: string;
    scheduledStartAt?: Date | null;
    tipModeratorId?: string | null;
    tipRecipientMode?: "host" | "moderator";
  } = {};

  if (typeof body.title === "string") data.title = body.title.trim().slice(0, 200);
  if (typeof body.description === "string") data.description = body.description.trim().slice(0, 4000);
  if (typeof body.thumbnailUrl === "string") data.thumbnailUrl = body.thumbnailUrl.trim().slice(0, 2000);
  if ("scheduledStartAt" in body) {
    if (body.scheduledStartAt == null || body.scheduledStartAt === "") {
      data.scheduledStartAt = null;
    } else {
      const d = new Date(body.scheduledStartAt);
      if (!Number.isNaN(d.getTime())) data.scheduledStartAt = d;
    }
  }

  if ("tipModeratorId" in body || "tipRecipientMode" in body || "tipsToModerator" in body) {
    if (existing.status === "ended") {
      return NextResponse.json({ error: "Cannot change tip settings on an ended show." }, { status: 409 });
    }
    const tipBuilt = await buildLiveTipRoomData(existing.sellerId, body);
    if (!tipBuilt.ok) {
      return NextResponse.json({ error: tipBuilt.error }, { status: 400 });
    }
    data.tipModeratorId = tipBuilt.data.tipModeratorId;
    data.tipRecipientMode = tipBuilt.data.tipRecipientMode;
  }

  if (Object.keys(data).length > 0) {
    await prisma.liveRoom.update({ where: { id }, data });
    emitLiveDiscoveryChanged({ roomId: id, status: existing.status, reason: "updated" });
  }

  if ("tipModeratorId" in body || "tipRecipientMode" in body || "tipsToModerator" in body) {
    const room = await prisma.liveRoom.findUnique({
      where: { id },
      select: {
        tipRecipientMode: true,
        tipModeratorId: true,
        tipModerator: { select: { id: true, username: true } },
      },
    });
    if (room) {
      return NextResponse.json({ ok: true, tip: serializeLiveTipConfig(room) });
    }
  }

  return NextResponse.json({ ok: true });
}
