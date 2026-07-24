import { NextResponse } from "next/server";
import { maybeMarkVariantBreakReady } from "@/lib/live-item-variant-break";
import { idleVariantSpotCommerceReset } from "@/lib/live-variant-spot-commerce";
import { prisma } from "@/lib/prisma";
import {
  emitLiveRoomQueueItemsChanged,
  emitPurchaseCompleted,
} from "@/lib/realtime-emit-server";
import { requireLiveRoomHostUser } from "@/lib/resolve-live-room-host-user";
import { normalizeUsernameForStorage } from "@/lib/username-policy";

type Body = {
  /** Buyer account username (with or without @). */
  username?: string;
  /** Optional override; defaults to the variant's list price. */
  priceUsd?: number;
};

/**
 * Host team board: select a PYT/PYD team, mark it sold, and record the buyer's username.
 * Does not charge Stripe — for auction wins settled off the auto-charge path or cash/manual sales.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string; variantId: string }> },
) {
  const { id: rawRoom, itemId, variantId } = await ctx.params;
  const liveRoomId = decodeURIComponent(rawRoom);

  const hostAuth = await requireLiveRoomHostUser(liveRoomId, req);
  if (hostAuth instanceof NextResponse) return hostAuth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = normalizeUsernameForStorage(
    typeof body.username === "string" ? body.username.replace(/^@+/, "") : "",
  );
  if (username.length < 3) {
    return NextResponse.json({ error: "Enter the buyer’s username." }, { status: 400 });
  }

  const buyer = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" }, suspendedAt: null },
    select: { id: true, username: true },
  });
  if (!buyer?.username) {
    return NextResponse.json(
      { error: `No account found for @${username}. They must have a Get Vaulted username.` },
      { status: 404 },
    );
  }

  const priceOverride =
    typeof body.priceUsd === "number" && Number.isFinite(body.priceUsd) && body.priceUsd >= 0
      ? Math.round(body.priceUsd * 100) / 100
      : null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.liveRoom.findUnique({
        where: { id: liveRoomId },
        select: { id: true, sellerId: true, status: true, roomVersion: true },
      });
      if (!room || room.status !== "live") {
        throw Object.assign(new Error("ROOM_NOT_LIVE"), { code: "ROOM_NOT_LIVE" });
      }

      const item = await tx.liveRoomItem.findFirst({
        where: { id: itemId, liveRoomId },
        select: {
          id: true,
          status: true,
          salesFormat: true,
          biddingOpen: true,
          auctionVariantId: true,
          currentBidUsd: true,
        },
      });
      if (!item) throw Object.assign(new Error("ITEM_NOT_FOUND"), { code: "ITEM_NOT_FOUND" });
      if (item.status !== "active" && item.status !== "queued") {
        throw Object.assign(new Error("ITEM_UNAVAILABLE"), { code: "ITEM_UNAVAILABLE" });
      }
      if (item.salesFormat !== "variant_selection" && item.salesFormat !== "team_break") {
        throw Object.assign(new Error("NOT_TEAM_BOARD"), { code: "NOT_TEAM_BOARD" });
      }

      const variant = await tx.liveItemVariant.findFirst({
        where: { id: variantId, liveRoomItemId: itemId },
        select: { id: true, label: true, priceUsd: true, quantityRemaining: true, status: true },
      });
      if (!variant) throw Object.assign(new Error("VARIANT_NOT_FOUND"), { code: "VARIANT_NOT_FOUND" });
      if (variant.quantityRemaining < 1 || variant.status === "sold_out") {
        throw Object.assign(new Error("SOLD_OUT"), { code: "SOLD_OUT" });
      }

      const unitPriceUsd = priceOverride ?? variant.priceUsd;
      const totalUsd = unitPriceUsd;

      const updated = await tx.liveItemVariant.updateMany({
        where: { id: variantId, quantityRemaining: { gte: 1 } },
        data: {
          quantityRemaining: { decrement: 1 },
          soldCount: { increment: 1 },
          isHot: false,
        },
      });
      if (updated.count === 0) {
        throw Object.assign(new Error("SOLD_OUT"), { code: "SOLD_OUT" });
      }

      const remaining = await tx.liveItemVariant.findUnique({
        where: { id: variantId },
        select: { quantityRemaining: true },
      });
      if (remaining && remaining.quantityRemaining <= 0) {
        await tx.liveItemVariant.update({
          where: { id: variantId },
          data: { status: "sold_out" },
        });
      }

      // If this team was mid-auction, close the timer so buyers stop bidding on it.
      if (item.biddingOpen && item.auctionVariantId === variantId) {
        await tx.liveRoomItem.update({
          where: { id: itemId },
          data: { ...idleVariantSpotCommerceReset(), itemVersion: { increment: 1 } },
        });
      } else {
        await tx.liveRoomItem.update({
          where: { id: itemId },
          data: { itemVersion: { increment: 1 } },
        });
      }

      const purchase = await tx.liveItemVariantPurchase.create({
        data: {
          liveRoomId,
          liveRoomItemId: itemId,
          variantId,
          buyerId: buyer.id,
          quantity: 1,
          unitPriceUsd,
          totalUsd,
          paymentStatus: "paid",
          paidAt: new Date(),
        },
        select: { id: true },
      });

      const remainingOpen = await tx.liveItemVariant.count({
        where: {
          liveRoomItemId: itemId,
          status: { not: "sold_out" },
          quantityRemaining: { gt: 0 },
        },
      });

      const roomWrite = await tx.liveRoom.update({
        where: { id: liveRoomId },
        data: { roomVersion: { increment: 1 } },
        select: { roomVersion: true },
      });

      return {
        purchaseId: purchase.id,
        label: variant.label,
        buyerUsername: buyer.username,
        totalUsd,
        roomVersion: roomWrite.roomVersion,
        sellerId: room.sellerId,
        itemSoldOut: remainingOpen === 0,
      };
    });

    await maybeMarkVariantBreakReady(itemId, liveRoomId, result.sellerId);
    emitLiveRoomQueueItemsChanged(liveRoomId);
    emitPurchaseCompleted(liveRoomId, itemId, {
      roomVersion: result.roomVersion,
      winnerUsername: result.buyerUsername,
      winnerId: buyer.id,
      winningAmountUsd: result.totalUsd,
      itemTitle: result.label,
      orderId: result.purchaseId,
      paymentStatus: "paid",
      itemSoldOut: result.itemSoldOut,
    });

    return NextResponse.json({
      ok: true,
      purchaseId: result.purchaseId,
      buyerUsername: result.buyerUsername,
      label: result.label,
      totalUsd: result.totalUsd,
    });
  } catch (e) {
    const code =
      typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "SOLD_OUT") {
      return NextResponse.json({ error: "That team is already sold." }, { status: 409 });
    }
    if (code === "ROOM_NOT_LIVE") {
      return NextResponse.json({ error: "Room must be live to mark teams sold." }, { status: 409 });
    }
    if (code === "ITEM_NOT_FOUND" || code === "VARIANT_NOT_FOUND") {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    if (code === "ITEM_UNAVAILABLE" || code === "NOT_TEAM_BOARD") {
      return NextResponse.json({ error: "This lot cannot be marked sold from the team board." }, { status: 409 });
    }
    console.error("[variants/manual-assign]", e);
    return NextResponse.json({ error: "Could not mark team sold." }, { status: 500 });
  }
}
