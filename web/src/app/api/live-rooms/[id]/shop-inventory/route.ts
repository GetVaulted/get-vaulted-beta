import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { parseListingInventoryChannel } from "@/lib/listing-inventory-channel";
import {
  isListingEligibleForShopPicker,
  listingPrimaryImageUrl,
  type LiveShopInventoryListingRow,
} from "@/lib/live-room-shop-inventory";

/**
 * GET /api/live-rooms/[id]/shop-inventory
 * Seller shop listings available to pull into this room's lineup.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  const { room } = hostAuth;

  const [listings, queuedListingIds, activeHolds] = await Promise.all([
    prisma.listing.findMany({
      where: {
        sellerId: room.sellerId,
        status: { in: ["draft", "active", "auction_live"] },
        moderationRemovedAt: null,
      },
      select: {
        id: true,
        title: true,
        description: true,
        buyingFormat: true,
        status: true,
        priceUsd: true,
        startingBidUsd: true,
        workspaceKey: true,
        moderationRemovedAt: true,
        platformShippingProfileId: true,
        images: { select: { url: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.liveRoomItem.findMany({
      where: {
        liveRoomId,
        listingId: { not: null },
        status: { in: ["queued", "active"] },
      },
      select: { listingId: true },
    }),
    prisma.liveAuctionInventoryHold.findMany({
      where: {
        listingId: { not: null },
        status: "active",
        expiresAt: { gt: new Date() },
      },
      select: { listingId: true },
    }),
  ]);

  const queuedSet = new Set(
    queuedListingIds.map((r) => r.listingId).filter((id): id is string => Boolean(id)),
  );
  const heldSet = new Set(
    activeHolds.map((r) => r.listingId).filter((id): id is string => Boolean(id)),
  );

  const rows: LiveShopInventoryListingRow[] = [];
  for (const listing of listings) {
    if (!isListingEligibleForShopPicker(listing)) continue;
    const imageUrl = listingPrimaryImageUrl(listing);
    if (!imageUrl) continue;
    const alreadyInQueue = queuedSet.has(listing.id);
    const inventoryHeld = heldSet.has(listing.id);
    rows.push({
      id: listing.id,
      title: listing.title,
      imageUrl,
      priceUsd: listing.priceUsd,
      startingBidUsd: listing.startingBidUsd,
      buyingFormat: listing.buyingFormat,
      status: listing.status,
      inventoryChannel: parseListingInventoryChannel(listing.description) ?? "marketplace",
      platformShippingProfileId: listing.platformShippingProfileId,
      alreadyInQueue,
      inventoryHeld,
      available: !alreadyInQueue && !inventoryHeld,
    });
  }

  // Prefer live_show inventory first, then marketplace.
  rows.sort((a, b) => {
    if (a.inventoryChannel !== b.inventoryChannel) {
      return a.inventoryChannel === "live_show" ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });

  return NextResponse.json({ listings: rows });
}
