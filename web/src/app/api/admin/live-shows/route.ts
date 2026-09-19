import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { liveShowGmvForFeeTierReconstruction } from "@/lib/live-show-gmv";
import { effectiveLiveRoomViewerCount } from "@/lib/live-room-viewer-count-freshness";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const status = (new URL(req.url).searchParams.get("status") ?? "all").trim();

  const where =
    status === "live"
      ? { status: "live" as const }
      : status === "scheduled"
        ? { status: "scheduled" as const }
        : status === "ended"
          ? { status: "ended" as const }
          : {};

  const rooms = await prisma.liveRoom.findMany({
    where,
    include: {
      seller: { select: { id: true, username: true, email: true } },
      items: {
        select: {
          id: true,
          title: true,
          status: true,
          currentBidUsd: true,
          biddingOpen: true,
          auctionEndsAt: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      _count: { select: { roomBids: true, reports: true } },
    },
    orderBy: [{ status: "asc" }, { scheduledStartAt: "desc" }, { startedAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({
    shows: rooms.map((r) => {
      const activeItem = r.items.find((i) => i.status === "active") ?? null;
      const queuedCount = r.items.filter((i) => i.status === "queued").length;
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        category: r.category,
        roomType: r.roomType,
        host: {
          id: r.seller.id,
          username: r.seller.username,
          email: r.seller.email,
        },
        viewerCount: effectiveLiveRoomViewerCount({
          viewerCount: r.viewerCount,
          viewerCountUpdatedAt: r.viewerCountUpdatedAt,
        }),
        bidCount: r._count.roomBids,
        reportCount: r._count.reports,
        streamHealth: r.streamHealth,
        streamProvider: r.streamProvider,
        streamMode: r.streamMode,
        ivsChannelArn: r.ivsChannelArn,
        ivsStageArn: r.ivsStageArn,
        ivsCompositionArn: r.ivsCompositionArn,
        lastIvsStatusSyncAt: r.lastIvsStatusSyncAt?.toISOString() ?? null,
        lastIvsError: r.lastIvsError,
        streamStartedAt: r.streamStartedAt?.toISOString() ?? null,
        streamEndedAt: r.streamEndedAt?.toISOString() ?? null,
        scheduledStartAt: r.scheduledStartAt?.toISOString() ?? null,
        startedAt: r.startedAt?.toISOString() ?? null,
        endedAt: r.endedAt?.toISOString() ?? null,
        // Ended shows have already had `completedSalesGmvUsd` reset to 0 — fall back to the
        // persisted `finalSalesGmvUsd` snapshot so the ended-shows list doesn't show $0 GMV.
        completedSalesGmvUsd: liveShowGmvForFeeTierReconstruction(r) ?? r.completedSalesGmvUsd,
        auctionEventSeq: r.auctionEventSeq,
        activeItem: activeItem
          ? {
              id: activeItem.id,
              title: activeItem.title,
              currentBidUsd: activeItem.currentBidUsd,
              biddingOpen: activeItem.biddingOpen,
              auctionEndsAt: activeItem.auctionEndsAt?.toISOString() ?? null,
            }
          : null,
        queuedItemCount: queuedCount,
        soldItemCount: r.items.filter((i) => i.status === "sold").length,
      };
    }),
  });
}
