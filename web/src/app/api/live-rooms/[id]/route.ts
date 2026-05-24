import { NextResponse } from "next/server";
import { getServerSessionSafe } from "@/lib/auth";
import { resolveLiveRoomsUserId, resolveOptionalLiveRoomsUserId } from "@/lib/resolve-live-rooms-auth";
import { attachHighBidderUsernames } from "@/lib/live-room-high-bidder-enrich";
import { buildLiveRoomDetail } from "@/lib/live-room-serialize";
import { logLiveLoaderDebug, safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { isHiddenFixtureSellerEmail } from "@/lib/demo-seed-sellers";
import { prisma } from "@/lib/prisma";
import { getBuyerLiveWalletReadiness } from "@/lib/buyer-live-wallet-readiness";
import { notifyFollowersSellerWentLive } from "@/lib/seller-follow-notify";
import { getSellerLiveReadiness } from "@/services/seller/live-show-readiness";
import { processAuctionPaymentExpiries } from "@/services/payments";
import { emitAuctionEnded, emitAuctionStarted, emitLiveDiscoveryChanged, emitTeamBoardChanged } from "@/lib/realtime-emit-server";

const includeDetail = {
  seller: { select: { id: true, username: true } as const },
  items: true as const,
  messages: {
    orderBy: { createdAt: "asc" as const },
    take: 200,
    include: { sender: { select: { username: true } as const } },
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

  if (viewerId) {
    try {
      await processAuctionPaymentExpiries();
    } catch (e) {
      console.error("[api/live-rooms/[id]] processAuctionPaymentExpiries", e);
    }
  }

  const room = await prisma.liveRoom.findUnique({
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
  } else {
    const w = await getBuyerLiveWalletReadiness(viewerId);
    detail.buyerLiveBidPaymentReady = w.paymentReady;
    detail.buyerLiveShippingReady = w.shippingReady;
  }
  detail.items = await attachHighBidderUsernames(detail.items);
  const activeId = detail.activeItem?.id ?? null;
  detail.activeItem = activeId ? detail.items.find((i) => i.id === activeId) ?? null : null;
  return NextResponse.json({ room: detail, serverNowMs });
}

type PatchBody = {
  title?: string;
  description?: string;
  scheduledStartAt?: string | null;
  thumbnailUrl?: string;
  action?: string;
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
    return NextResponse.json({ ok: true });
  }

  const data: {
    title?: string;
    description?: string;
    thumbnailUrl?: string;
    scheduledStartAt?: Date | null;
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

  if (Object.keys(data).length > 0) {
    await prisma.liveRoom.update({ where: { id }, data });
    emitLiveDiscoveryChanged({ roomId: id, status: existing.status, reason: "updated" });
  }

  return NextResponse.json({ ok: true });
}
