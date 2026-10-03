import { NextResponse } from "next/server";
import type { BreakSpot, LiveRoomItem, User } from "@/generated/prisma/client";
import { listLiveGiveawaysForRoom } from "@/lib/live-giveaway";
import {
  finalizeOverdueLiveAuctionLotsForRoom,
  LIVE_AUCTION_AUTO_CLOSE_GRACE_MS,
} from "@/lib/live-auction-finalize";
import { parseTeamLabelsJson } from "@/lib/live-room-host-auth";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { logLiveLoaderDebug, safeDecodeRouteSegment } from "@/lib/live-loader-debug";
import { prisma } from "@/lib/prisma";
import { fetchHostRecentSales } from "@/lib/live-room-recent-sales";
import { buildLiveShowFeeTierSnapshot } from "@/lib/platform-fee-policy";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { effectiveLiveRoomViewerCount } from "@/lib/live-room-viewer-count-freshness";
import { fetchLiveShowSellerSummary } from "@/lib/live-show-seller-summary";
import {
  logSellerShowSummaryEvent,
  type LiveShowSellerSummaryDTO,
} from "@/lib/live-show-seller-summary-shared";
import { ensureLiveShowFeeCache } from "@/services/live-show-fee-settings";
import { attachHighBidderUsernames } from "@/lib/live-room-high-bidder-enrich";
import { listUnresolvedPaymentFailuresForRoom } from "@/lib/live-room-payment-failure";
import { serializeLiveRoomItem, serializeLiveRoomMessage } from "@/lib/live-room-serialize";
import { resolveHostConsoleUnitsClaimedOverride } from "@/lib/live-room-item-quantity-display";
import { liveRoomItemsHostConsoleInclude } from "@/lib/live-item-variant-include";
import { attachHostConsoleVariantPurchases } from "@/lib/live-item-variant-host-console-enrich";
import { enrichLiveRoomItemsRandomClaims } from "@/lib/live-variant-random-claims";
import { apiErrorResponseFromUnknown } from "@/lib/prisma-api-error-response";
import { logSellerRoomStateSnapshot } from "@/lib/log-room-state-snapshot";
import { computeBreakBuyerPhase } from "@/lib/live-room-break-public";

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

function safeSerializeItem(it: LiveRoomItem, unitsClaimed?: number | null) {
  try {
    return serializeLiveRoomItem(
      it,
      typeof unitsClaimed === "number" ? { unitsClaimed } : undefined,
    );
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

    await ensureLiveShowFeeCache(true);

    const url = new URL(req.url);
    const lite = url.searchParams.get("lite") === "1";
    const isMobileClient = req.headers.get("x-gv-client") === "getvaulted-mobile";
    const messageTake = isMobileClient ? 40 : lite ? 60 : 120;

    const buyerQ = url.searchParams.get("buyerSearch")?.trim() ?? "";
    const pickerQ = url.searchParams.get("pickerSearch")?.trim() ?? "";

    const roomRow = await prisma.liveRoom.findUnique({
      where: { id: liveRoomId },
      include: {
        items: liveRoomItemsHostConsoleInclude,
        breakSpots: {
          include: { user: { select: { id: true, username: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: messageTake,
          include: { sender: { select: { username: true, image: true } } },
        },
      },
    });
    if (!roomRow) {
      logLiveLoaderDebug("api_host_console_room_row_missing", {
        liveRoomId,
        idParamRaw: raw,
        sessionUserId: hostUserId,
      });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Host polls this endpoint while on air — finalize overdue timers here so settlement does not
    // depend only on buyer room GETs (empty room / backgrounded buyers used to stall closes).
    let consoleRoom = roomRow;
    if (
      consoleRoom.status === "live" &&
      (consoleRoom.roomType === "auction" || consoleRoom.roomType === "break" || consoleRoom.roomType === "sale")
    ) {
      const nowMs = Date.now();
      const hasOverdue = consoleRoom.items.some(
        (it) =>
          it.status === "active" &&
          it.biddingOpen &&
          it.auctionEndsAt != null &&
          it.auctionEndsAt.getTime() <= nowMs - LIVE_AUCTION_AUTO_CLOSE_GRACE_MS,
      );
      if (hasOverdue) {
        try {
          await finalizeOverdueLiveAuctionLotsForRoom({
            liveRoomId,
            room: {
              sellerId: consoleRoom.sellerId,
              roomType: consoleRoom.roomType,
              roomVersion: consoleRoom.roomVersion,
            },
            nowMs,
            trigger: "read_sweep",
          });
          const reloaded = await prisma.liveRoom.findUnique({
            where: { id: liveRoomId },
            include: {
              items: liveRoomItemsHostConsoleInclude,
              breakSpots: {
                include: { user: { select: { id: true, username: true, email: true } } },
                orderBy: { createdAt: "asc" },
              },
              messages: {
                where: { deletedAt: null },
                orderBy: { createdAt: "desc" },
                take: messageTake,
                include: { sender: { select: { username: true, image: true } } },
              },
            },
          });
          if (reloaded) consoleRoom = reloaded;
        } catch (e) {
          console.error("[host-console] finalizeOverdueLiveAuctionLots", e);
        }
      }
    }

    const itemsWithPurchases = await attachHostConsoleVariantPurchases(consoleRoom.items);
    const room = { ...consoleRoom, items: itemsWithPurchases };

    const userSearch = async (q: string) =>
      prisma.user.findMany({
        where: {
          OR: [{ username: { contains: q } }, { email: { contains: q } }],
          suspendedAt: null,
        },
        take: 15,
        select: { id: true, username: true, email: true },
      });

    const [hits, buyerMatches, pickerMatches, recentSales, sellerUnresolvedPaymentFailures, giveaways, sellerSummary] =
      await Promise.all([
        lite
          ? Promise.resolve([])
          : prisma.breakHit.findMany({
              where: { liveRoomId },
              orderBy: { createdAt: "desc" },
              take: 100,
              include: { buyer: { select: { id: true, username: true } } },
            }),
        buyerQ.length >= 2 ? userSearch(buyerQ) : Promise.resolve([]),
        pickerQ.length >= 2 ? userSearch(pickerQ) : Promise.resolve([]),
        lite
          ? Promise.resolve([])
          : fetchHostRecentSales(liveRoomId, room.sellerId).catch((e) => {
              console.error("[host-console] fetchHostRecentSales failed", { liveRoomId, e });
              return [] as Awaited<ReturnType<typeof fetchHostRecentSales>>;
            }),
        listUnresolvedPaymentFailuresForRoom(liveRoomId).catch((e) => {
          console.error("[host-console] listUnresolvedPaymentFailuresForRoom failed", { liveRoomId, e });
          return [] as Awaited<ReturnType<typeof listUnresolvedPaymentFailuresForRoom>>;
        }),
        listLiveGiveawaysForRoom(liveRoomId, true).catch((e) => {
          console.error("[host-console] listLiveGiveawaysForRoom failed", { liveRoomId, e });
          return [] as Awaited<ReturnType<typeof listLiveGiveawaysForRoom>>;
        }),
        fetchLiveShowSellerSummary(liveRoomId).catch((e) => {
          console.error("[host-console] fetchLiveShowSellerSummary failed", { liveRoomId, e });
          return null as LiveShowSellerSummaryDTO | null;
        }),
      ]);

    const feeTierGmv = liveShowGmvForFeeTierReconstruction(room) ?? 0;
    const feeTier =
      sellerSummary?.feeTier ?? buildLiveShowFeeTierSnapshot(feeTierGmv);

    if (
      !lite &&
      sellerSummary &&
      sellerSummary.grossShowSalesCents > 0 &&
      recentSales.filter((r) => r.paymentTone === "paid" && r.amountUsd > 0).length === 0
    ) {
      logSellerShowSummaryEvent("seller_show_summary_inconsistent", {
        showId: liveRoomId,
        reason: "recent_sales_empty_but_show_sales_positive",
        newSalesCents: sellerSummary.grossShowSalesCents,
        paidOrderCount: sellerSummary.paidOrderCount,
        currentTier: sellerSummary.currentFeeRatePercent,
        nextTier: sellerSummary.feeTier.nextTierFeePercent,
      });
    }

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
      // Do not pass unitsClaimed=0 for multi-qty auctions with no BreakSpots — that overrides
      // remaining-quantity math and sticks the seller UI on #1 while buyers/sales advance.
      return {
        item: safeSerializeItem(it, resolveHostConsoleUnitsClaimedOverride(claims.length)),
        claim: claims[0] ?? null,
        claims,
      };
    });
    const flatItems = queueItemsRaw.map((q) => q.item);
    const flatEnriched = await attachHighBidderUsernames(flatItems);
    let itemsWithRandomClaims = flatEnriched;
    try {
      itemsWithRandomClaims = await enrichLiveRoomItemsRandomClaims(flatEnriched);
    } catch (e) {
      console.error("[host-console] enrichLiveRoomItemsRandomClaims failed", { liveRoomId, e });
    }
    const enrichedById = new Map(itemsWithRandomClaims.map((row) => [row.id, row]));
    const queueItems = queueItemsRaw.map((row) => ({
      ...row,
      item: enrichedById.get(row.item.id) ?? row.item,
    }));

    const orphanSpots = room.breakSpots.filter((s) => !s.liveRoomItemId).map(mapClaim);

    const messagesAsc = [...room.messages].reverse().map((m) => serializeLiveRoomMessage(m));

    const serverNowMs = Date.now();
    const activeRow = queueItems.find((q) => q.item.status.toLowerCase() === "active") ?? null;
    const selectedForLog = queueItems[0] ?? null;
    logSellerRoomStateSnapshot({
      source: "host-console",
      roomId: liveRoomId,
      roomStatus: room.status,
      roomType: room.roomType,
      activeItem: activeRow?.item ?? null,
      overlayItem: activeRow?.item ?? null,
      breakPhase:
        room.roomType === "break"
          ? computeBreakBuyerPhase(room, room.breakSpots.length)
          : null,
      lockPurchases: room.lockPurchases,
      breakPaused: room.breakPaused,
      serverNowMs,
      extra: {
        previewItemId: selectedForLog?.item.id ?? null,
        purchasableFromActiveOnly: true,
        lite,
      },
    });
    return NextResponse.json({
      serverNowMs,
      syncScope: lite ? ("lite" as const) : ("full" as const),
      room: {
        id: room.id,
        sellerId: room.sellerId,
        title: room.title,
        description: room.description,
        showNotes: room.showNotes,
        category: room.category,
        roomType: room.roomType,
        status: room.status,
        discoveryVisibility: room.discoveryVisibility === "private" ? "private" : "public",
        streamHealth: room.streamHealth,
        streamPaused: room.streamPaused,
        streamMode: room.streamMode,
        ingestEndpoint: room.ivsIngestEndpoint,
        roomVersion: room.roomVersion,
        thumbnailUrl: room.thumbnailUrl,
        viewerCount: effectiveLiveRoomViewerCount({
          viewerCount: room.viewerCount,
          viewerCountUpdatedAt: room.viewerCountUpdatedAt,
        }),
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
      // Once the show has ended, `completedSalesGmvUsd` has already been reset to 0 — use the
      // persisted `finalSalesGmvUsd` snapshot instead so the host's own post-show fee-tier display
      // doesn't drift to $0/tier-0 (see `liveShowGmvForFeeTierReconstruction`).
      feeTier,
      sellerSummary,
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
      sellerUnresolvedPaymentFailures,
      giveaways,
    });
  } catch (e) {
    console.error("[api GET /api/live-rooms/[id]/host-console] failed", { liveRoomId, raw: e });
    return apiErrorResponseFromUnknown(e, {
      error: "Could not load host console.",
      code: "HOST_CONSOLE_FAILED",
    });
  }
}
