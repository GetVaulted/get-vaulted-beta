import type { LiveRoom, LiveRoomItem, LiveRoomMessage } from "@/generated/prisma/client";
import { attachHighBidderUsernames } from "@/lib/live-room-high-bidder-enrich";
import { computeBreakBuyerPhase } from "@/lib/live-room-break-public";
import { liveRoomItemsWithVariantsInclude } from "@/lib/live-item-variant-include";
import { serializeLiveRoomItem, type LiveRoomItemDTO } from "@/lib/live-room-serialize";
import { effectiveLiveRoomViewerCount } from "@/lib/live-room-viewer-count-freshness";
import { prisma } from "@/lib/prisma";

/** Overlay-safe fields only — no seller PII, stream keys, or commerce internals. */
export type ObsWidgetSnapshotDTO = {
  title: string;
  status: string;
  roomType: string;
  viewerCount: number;
  serverNowMs: number;
  activeItem: {
    id: string;
    title: string;
    status: string;
    currentBidUsd: number | null;
    startingBidUsd: number | null;
    priceUsd: number | null;
    lastHighBidderUsername: string | null;
    biddingOpen: boolean;
    auctionEndsAt: string | null;
  } | null;
  recentTipBodies: string[];
  breakPhaseLabel: string | null;
  breakSpotsOpen: number | null;
};

function toOverlayItem(item: LiveRoomItemDTO | null): ObsWidgetSnapshotDTO["activeItem"] {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    currentBidUsd: item.currentBidUsd,
    startingBidUsd: item.startingBidUsd,
    priceUsd: item.priceUsd,
    lastHighBidderUsername: item.lastHighBidderUsername,
    biddingOpen: item.biddingOpen,
    auctionEndsAt: item.auctionEndsAt,
  };
}

function countBreakSpotsOpen(items: LiveRoomItemDTO[]): number | null {
  const active = items.find((i) => i.status === "active");
  if (!active?.variants?.length) return null;
  return active.variants.reduce((sum, v) => sum + Math.max(0, v.quantityRemaining ?? 0), 0);
}

export async function buildObsWidgetSnapshot(liveRoomId: string): Promise<ObsWidgetSnapshotDTO | null> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: liveRoomId },
    include: {
      items: liveRoomItemsWithVariantsInclude,
      breakSpots: { select: { id: true } },
      messages: {
        where: { messageType: "tip", deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { body: true },
      },
    },
  });
  if (!room) return null;

  const itemsSerialized = room.items.map((it) => serializeLiveRoomItem(it));
  const items = await attachHighBidderUsernames(itemsSerialized);
  const activeRow = items.find((i) => i.status === "active") ?? null;

  let breakPhaseLabel: string | null = null;
  let breakSpotsOpen: number | null = null;
  if (room.roomType === "break") {
    breakPhaseLabel = computeBreakBuyerPhase(room as LiveRoom & { breakSpots: { id: string }[] }, room.breakSpots.length);
    breakSpotsOpen = countBreakSpotsOpen(items);
  }

  const recentTipBodies = room.messages
    .map((m: Pick<LiveRoomMessage, "body">) => m.body.trim())
    .filter(Boolean)
    .reverse()
    .slice(-5);

  return {
    title: room.title,
    status: room.status,
    roomType: room.roomType,
    // Same freshness gate as discovery/admin/host-console — without it, a stream that ends
    // (or a widget left open) shows whatever count was last synced, forever, instead of resetting
    // to 0. This is the overlay sellers put on-screen in OBS, so a stale number is highly visible.
    viewerCount: effectiveLiveRoomViewerCount({
      viewerCount: room.viewerCount,
      viewerCountUpdatedAt: room.viewerCountUpdatedAt,
    }),
    serverNowMs: Date.now(),
    activeItem: toOverlayItem(activeRow),
    recentTipBodies,
    breakPhaseLabel,
    breakSpotsOpen,
  };
}
