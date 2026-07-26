import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { emitLiveRoomQueueItemsChanged } from "@/lib/realtime-emit-server";
import { isVariantSalesFormat } from "@/lib/live-item-variant-presets";

type PostBody = {
  sourceRoomId?: string;
};

/**
 * POST /api/live-rooms/[id]/items/import-from-room
 * Clone unsold queue rows (and their variants) from another room owned by the same seller.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: raw } = await ctx.params;
  const liveRoomId = decodeURIComponent(raw);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;
  const { room } = hostAuth;

  if (room.status === "ended") {
    return NextResponse.json({ error: "This room has ended. You cannot add queue items." }, { status: 409 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sourceRoomId = typeof body.sourceRoomId === "string" ? body.sourceRoomId.trim() : "";
  if (!sourceRoomId) {
    return NextResponse.json({ error: "sourceRoomId is required." }, { status: 400 });
  }
  if (sourceRoomId === liveRoomId) {
    return NextResponse.json({ error: "Pick a different show to copy from." }, { status: 400 });
  }

  const sourceRoom = await prisma.liveRoom.findFirst({
    where: { id: sourceRoomId, sellerId: room.sellerId },
    select: { id: true, title: true },
  });
  if (!sourceRoom) {
    return NextResponse.json({ error: "Source show not found." }, { status: 404 });
  }

  const sourceItems = await prisma.liveRoomItem.findMany({
    where: {
      liveRoomId: sourceRoomId,
      status: { in: ["queued", "active", "skipped"] },
    },
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });

  if (sourceItems.length === 0) {
    return NextResponse.json({ error: "That show has no unsold lineup items to copy." }, { status: 400 });
  }

  const existingListingIds = await prisma.liveRoomItem.findMany({
    where: {
      liveRoomId,
      listingId: { not: null },
      status: { in: ["queued", "active"] },
    },
    select: { listingId: true },
  });
  const alreadyLinked = new Set(
    existingListingIds.map((r) => r.listingId).filter((id): id is string => Boolean(id)),
  );

  const maxSort = await prisma.liveRoomItem.aggregate({
    where: { liveRoomId },
    _max: { sortOrder: true },
  });
  let nextSort = (maxSort._max.sortOrder ?? -1) + 1;

  let imported = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of sourceItems) {
      if (item.listingId && alreadyLinked.has(item.listingId)) {
        skipped += 1;
        continue;
      }

      const qty = Math.min(512, Math.max(1, item.quantityInitial || item.quantity || 1));
      const created = await tx.liveRoomItem.create({
        data: {
          liveRoomId,
          listingId: item.listingId,
          title: item.title,
          imageUrl: item.imageUrl,
          priceUsd: item.priceUsd,
          startingBidUsd: item.startingBidUsd ?? 1,
          bidIncrementUsd: null,
          reservePriceUsd: item.reservePriceUsd,
          currentBidUsd: null,
          status: "queued",
          sortOrder: nextSort++,
          teamBoardMisc: item.teamBoardMisc,
          quantity: isVariantSalesFormat(item.salesFormat) ? 1 : qty,
          quantityInitial: isVariantSalesFormat(item.salesFormat) ? 1 : qty,
          salesFormat: item.salesFormat,
          variantAssignmentMode: item.variantAssignmentMode,
          variantSpotCommerceDefault: item.variantSpotCommerceDefault,
          shippingProfileId: item.shippingProfileId,
          sellerShippingProfileId: item.sellerShippingProfileId,
          customWeightOz: item.customWeightOz,
          customLengthIn: item.customLengthIn,
          customWidthIn: item.customWidthIn,
          customHeightIn: item.customHeightIn,
          requiresSeparatePackage: item.requiresSeparatePackage,
        },
        select: { id: true },
      });

      if (item.variants.length > 0) {
        await tx.liveItemVariant.createMany({
          data: item.variants.map((v, i) => ({
            liveRoomItemId: created.id,
            label: v.label,
            priceUsd: v.priceUsd,
            quantityInitial: Math.max(1, v.quantityInitial || 1),
            quantityRemaining: Math.max(1, v.quantityInitial || 1),
            isHot: false,
            imageUrl: v.imageUrl ?? "",
            color: v.color ?? "",
            sortOrder: v.sortOrder ?? i,
          })),
        });
      }

      if (item.listingId) alreadyLinked.add(item.listingId);
      imported += 1;
    }
  });

  if (imported === 0) {
    return NextResponse.json(
      {
        error:
          skipped > 0
            ? "Those items are already in this show's lineup."
            : "Nothing could be copied from that show.",
        imported: 0,
        skipped,
      },
      { status: 409 },
    );
  }

  emitLiveRoomQueueItemsChanged(liveRoomId);
  return NextResponse.json({
    imported,
    skipped,
    sourceRoomId: sourceRoom.id,
    sourceTitle: sourceRoom.title,
  });
}
