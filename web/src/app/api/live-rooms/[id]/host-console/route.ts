import { NextResponse } from "next/server";
import type { BreakSpot, LiveRoomItem, User } from "@/generated/prisma/client";
import { parseTeamLabelsJson } from "@/lib/live-room-host-auth";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { logLiveLoaderDebug, safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { prisma } from "@/lib/prisma";
import { fetchHostRecentSales } from "@/lib/live-room-recent-sales";
import { buildLiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import { attachHighBidderUsernames } from "@/lib/live-room-high-bidder-enrich";
import { serializeLiveRoomItem, serializeLiveRoomMessage } from "@/lib/live-room-serialize";
import { liveRoomItemsWithVariantsInclude } from "@/lib/live-item-variant-include";
import { prismaLiveRoomCreateHint, serializePrismaClientError } from "@/lib/prisma-client-error-serialize";

type SpotWithUser = BreakSpot & { user: Pick<User, "id" | "username" | "email"> };

function mapClaim(claim: SpotWithUser) {
  return {
    id: claim.id,
    spotLabel: claim.spotLabel,
    priceUsd: claim.priceUsd,
    claimStatus: claim.claimStatus,
    paidAt: claim.paidAt?.toISOString() ?? null,
    lockedAt: claim.lockedAt?.toISOString() ?? null,
    user: {
      id: claim.user?.id ?? "",
      username: claim.user?.username?.trim() || "buyer",
      email: claim.user?.email?.trim() || "",
    },
    createdAt: claim.createdAt.toISOString(),
  };
}

function safeSerializeItem(it: LiveRoomItem, unitsClaimed?: number) {
  try {
    return serializeLiveRoomItem(it, { unitsClaimed });
  } catch (e) {
    console.error("[host-console] serializeLiveRoomItem failed", { itemId: it.id, e });
    throw e;
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = safeDecodeRouteSegment(raw ?? "");

  try {
    const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
    if (hostAuth instanceof NextResponse) {
      logLiveLoaderDebug("api_host_console_access_denied", {
        liveRoomId,
        idParamRaw: raw,
        status: hostAuth.status,
      });
      return hostAuth;
    }
    const { userId: hostUserId, isAdmin } = hostAuth;

    const room = await prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      include: {
        items: liveRoomItemsWithVariantsInclude,
        breakSpots: {
          include: { user: { select: { id: true, username: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 200,
          include: { sender: { select: { username: true } } },
        },
      },
    });
    if (!room) {
      logLiveLoaderDebug("api_host_console_room_row_missing", {
        liveRoomId,
        idParamRaw: raw,
        sessionUserId: hostUserId,
      });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const buyerQ = url.searchParams.get("buyerSearch")?.trim() ?? "";
    const pickerQ = url.searchParams.get("pickerSearch")?.trim() ?? "";
    let buyerMatches: { id: string; username: string; email: string }[] = [];
    let pickerMatches: { id: string; username: string; email: string }[] = [];

    const userSearch = async (q: string) =>
      prisma.user.findMany({
        where: {
          OR: [{ username: { contains: q } }, { email: { contains: q } }],
          suspendedAt: null,
        },
        take: 15,
        select: { id: true, username: true, email: true },
      });

    if (buyerQ.length >= 2) {
      buyerMatches = await userSearch(buyerQ);
    }
    if (pickerQ.length >= 2) {
      pickerMatches = await userSearch(pickerQ);
    }

    const hits = await prisma.breakHit.findMany({
      where: { liveRoomId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { buyer: { select: { id: true, username: true } } },
    });

    const itemsSorted = [...room.items].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const spotsByItemId = new Map<string, SpotWithUser[]>();
    for (const s of room.breakSpots) {
      if (!s.liveRoomItemId) continue;
      const list = spotsByItemId.get(s.liveRoomItemId) ?? [];
      list.push(s);
      spotsByItemId.set(s.liveRoomItemId, list);
    }
    for (const [, spots] of spotsByItemId) {
      spots.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    const queueItemsRaw = itemsSorted.map((it) => {
      const rawSpots = spotsByItemId.get(it.id) ?? [];
      const claims = rawSpots.map(mapClaim);
      return {
        item: safeSerializeItem(it, claims.length),
        claim: claims[0] ?? null,
        claims,
      };
    });
    const flatItems = queueItemsRaw.map((q) => q.item);
    const flatEnriched = await attachHighBidderUsernames(flatItems);
    const enrichedById = new Map(flatEnriched.map((row) => [row.id, row]));
    const queueItems = queueItemsRaw.map((row) => ({
      ...row,
      item: enrichedById.get(row.item.id) ?? row.item,
    }));

    const orphanSpots = room.breakSpots.filter((s) => !s.liveRoomItemId).map(mapClaim);

    const messagesAsc = [...room.messages].reverse().map((m) => serializeLiveRoomMessage(m));

    let recentSales: Awaited<ReturnType<typeof fetchHostRecentSales>> = [];
    try {
      recentSales = await fetchHostRecentSales(liveRoomId, room.sellerId);
    } catch (e) {
      console.error("[host-console] fetchHostRecentSales failed", { liveRoomId, e });
    }

    const serverNowMs = Date.now();
    return NextResponse.json({
      serverNowMs,
      room: {
        id: room.id,
        sellerId: room.sellerId,
        title: room.title,
        description: room.description,
        category: room.category,
        roomType: room.roomType,
        status: room.status,
        roomVersion: room.roomVersion,
        thumbnailUrl: room.thumbnailUrl,
        viewerCount: room.viewerCount,
        scheduledStartAt: room.scheduledStartAt?.toISOString() ?? null,
        startedAt: room.startedAt?.toISOString() ?? null,
        endedAt: room.endedAt?.toISOString() ?? null,
        breakFormat: room.breakFormat,
        breakDisplayTitle: room.breakDisplayTitle,
        breakSpotPriceUsd: room.breakSpotPriceUsd,
        breakTotalSpots: room.breakTotalSpots,
        breakTeamLabels: parseTeamLabelsJson(room.breakTeamLabelsJson),
        breakFilledLockedAt: room.breakFilledLockedAt?.toISOString() ?? null,
        assignmentsLockedAt: room.assignmentsLockedAt?.toISOString() ?? null,
        randomizedAt: room.randomizedAt?.toISOString() ?? null,
        randomizationSeed: room.randomizationSeed,
        randomizationPreview: room.randomizationPreviewJson,
        randomizationResult: room.randomizationResultJson,
        lockPurchases: room.lockPurchases,
        breakPaused: room.breakPaused,
        teamBoardLeague: room.teamBoardLeague,
        completedSalesGmvUsd: room.completedSalesGmvUsd,
      },
      feeTier: buildLiveShowFeeTierSnapshot(room.completedSalesGmvUsd),
      queueItems,
      orphanSpots,
      messages: messagesAsc,
      hits: hits.map((h) => ({
        id: h.id,
        liveRoomItemId: h.liveRoomItemId,
        spotLabel: h.spotLabel,
        title: h.title,
        notes: h.notes,
        imageUrl: h.imageUrl,
        buyer: h.buyer ? { id: h.buyer.id, username: h.buyer.username ?? "buyer" } : null,
        createdAt: h.createdAt.toISOString(),
      })),
      isAdmin,
      buyerMatches,
      pickerMatches,
      recentSales,
    });
  } catch (e) {
    const prismaDto = serializePrismaClientError(e);
    console.error("[api GET /api/live-rooms/[id]/host-console] failed", {
      liveRoomId,
      prisma: prismaDto,
      raw: e,
    });
    return NextResponse.json(
      {
        error: "Could not load host console.",
        code: "HOST_CONSOLE_FAILED",
        detail: prismaDto.message,
        hint: prismaLiveRoomCreateHint(prismaDto),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
