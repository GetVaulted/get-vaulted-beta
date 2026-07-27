import { NextResponse } from "next/server";
import { maybeMarkVariantBreakReady } from "@/lib/live-item-variant-break";
import { idleVariantSpotCommerceReset } from "@/lib/live-variant-spot-commerce";
import {
  computeOffPlatformPlatformFee,
  normalizeOffPlatformSaleAmountUsd,
  parseOffPlatformSettlementMethod,
  parseOffPlatformZeroReason,
} from "@/lib/off-platform-settlement";
import { recordLiveShowCompletedSaleTx } from "@/lib/live-show-gmv";
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
  /** Declared amount the buyer paid the seller off-platform. Required. */
  priceUsd?: number;
  /** How the buyer paid (Venmo, Cash App, cash, etc.). Required. */
  settlementMethod?: string;
  /** Required when priceUsd is $0. */
  zeroReason?: string;
  /** Optional host note (e.g. Venmo handle confirmation). */
  note?: string;
};

/**
 * Host team board: mark sold for an off-platform settlement (Venmo / PayPal / cash / etc.).
 * Does not charge the buyer on Stripe. Seller owes Get Vaulted the live platform fee on amount > $0.
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

  const settlementMethod = parseOffPlatformSettlementMethod(body.settlementMethod);
  if (!settlementMethod) {
    return NextResponse.json(
      { error: "Select how the buyer paid (Venmo, PayPal, Cash App, cash, Zelle, or other)." },
      { status: 400 },
    );
  }

  const amountUsd = normalizeOffPlatformSaleAmountUsd(body.priceUsd);
  if (amountUsd == null) {
    return NextResponse.json({ error: "Enter the sale amount (use 0 for a free/comp)." }, { status: 400 });
  }

  const zeroReason = amountUsd < 0.01 ? parseOffPlatformZeroReason(body.zeroReason) : null;
  if (amountUsd < 0.01 && !zeroReason) {
    return NextResponse.json(
      { error: "For a $0 sale, choose a reason (giveaway, comp, mistake, or other)." },
      { status: 400 },
    );
  }

  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 280)
      : null;

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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.liveRoom.findUnique({
        where: { id: liveRoomId },
        select: {
          id: true,
          sellerId: true,
          status: true,
          roomVersion: true,
          completedSalesGmvUsd: true,
          seller: { select: { sellerPlatformFeePercentOverride: true } },
        },
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
      if (variant.quantityRemaining < 1 || variant.status === "sold_out" || variant.status === "removed") {
        throw Object.assign(new Error("SOLD_OUT"), { code: "SOLD_OUT" });
      }

      const unitPriceUsd = amountUsd;
      const totalUsd = unitPriceUsd;
      const fee = computeOffPlatformPlatformFee({
        saleAmountUsd: totalUsd,
        liveShowId: liveRoomId,
        liveShowCompletedGmvUsd: room.completedSalesGmvUsd,
        sellerPlatformFeePercentOverride: room.seller.sellerPlatformFeePercentOverride,
      });

      const updated = await tx.liveItemVariant.updateMany({
        where: { id: variantId, quantityRemaining: { gte: 1 }, status: { not: "removed" } },
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
          settlementChannel: "off_platform",
          offPlatformMethod: settlementMethod,
          offPlatformZeroReason: zeroReason,
          offPlatformNote: note,
          platformFeeCents: fee.feeCents,
          platformFeePercent: fee.feePercent,
          platformFeeStatus: fee.feeStatus,
        },
        select: { id: true },
      });

      if (totalUsd >= 0.01) {
        await recordLiveShowCompletedSaleTx(tx, liveRoomId, totalUsd);
      }

      const remainingOpen = await tx.liveItemVariant.count({
        where: {
          liveRoomItemId: itemId,
          status: { notIn: ["sold_out", "removed"] },
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
        platformFeeCents: fee.feeCents,
        platformFeePercent: fee.feePercent,
        platformFeeStatus: fee.feeStatus,
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
      platformFeeCents: result.platformFeeCents,
      platformFeePercent: result.platformFeePercent,
      platformFeeStatus: result.platformFeeStatus,
      platformFeeDue: result.platformFeeStatus === "unpaid" && result.platformFeeCents > 0,
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
