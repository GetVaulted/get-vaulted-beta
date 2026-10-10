import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/admin/admin-audit";

export class SpotFixError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
    this.name = "SpotFixError";
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Point a sold spot at a different buyer (wrong username, spot sold to the wrong person).
 * Refuses once an order exists for the spot, because the order is what the buyer pays and ships on.
 * A spot paid through Stripe needs `acknowledgePaidOnPlatform` since the payer stays the original card.
 */
export async function reassignSpotBuyer(args: {
  adminUserId: string;
  purchaseId: string;
  toUsername: string;
  reason: string;
  acknowledgePaidOnPlatform?: boolean;
}) {
  return prisma.$transaction(async (tx: Tx) => {
    const p = await tx.liveItemVariantPurchase.findUnique({
      where: { id: args.purchaseId },
      select: {
        id: true,
        buyerId: true,
        liveRoomId: true,
        liveRoomItemId: true,
        paymentStatus: true,
        fulfillmentOrderId: true,
        stripePaymentIntentId: true,
      },
    });
    if (!p) throw new SpotFixError("NOT_FOUND", 404);
    if (p.fulfillmentOrderId) throw new SpotFixError("ORDER_EXISTS", 409);
    if (p.paymentStatus === "cancelled" || p.paymentStatus === "failed") throw new SpotFixError("SPOT_NOT_ACTIVE", 400);
    if (p.stripePaymentIntentId && !args.acknowledgePaidOnPlatform) throw new SpotFixError("PAID_ON_PLATFORM_NEEDS_ACK", 409);

    const target = await tx.user.findFirst({
      where: { username: { equals: args.toUsername.trim().replace(/^@/, ""), mode: "insensitive" } },
      select: { id: true, username: true, suspendedAt: true },
    });
    if (!target) throw new SpotFixError("USER_NOT_FOUND", 404);
    if (target.suspendedAt) throw new SpotFixError("USER_SUSPENDED", 400);
    if (target.id === p.buyerId) throw new SpotFixError("SAME_BUYER", 400);

    await tx.liveItemVariantPurchase.update({ where: { id: p.id }, data: { buyerId: target.id } });
    await tx.liveRoomItem.update({ where: { id: p.liveRoomItemId }, data: { itemVersion: { increment: 1 } } });
    await tx.liveRoom.update({ where: { id: p.liveRoomId }, data: { roomVersion: { increment: 1 } } });

    await logAdminAction(
      {
        adminUserId: args.adminUserId,
        action: "spot.reassign_buyer",
        targetType: "purchase",
        targetId: p.id,
        targetUserId: target.id,
        reason: args.reason,
        detail: { fromBuyerId: p.buyerId, toBuyerId: target.id, liveRoomId: p.liveRoomId, paidOnPlatform: !!p.stripePaymentIntentId },
      },
      tx as never,
    );
    return { purchaseId: p.id, buyerId: target.id, username: target.username };
  });
}

/**
 * Free a sold spot so it can be sold again. Only for spots that did not take card money
 * (pending, $0 carry-overs, off-platform): a card-paid spot has to be refunded instead.
 */
export async function releaseSpot(args: { adminUserId: string; purchaseId: string; reason: string }) {
  return prisma.$transaction(async (tx: Tx) => {
    const p = await tx.liveItemVariantPurchase.findUnique({
      where: { id: args.purchaseId },
      select: {
        id: true,
        buyerId: true,
        liveRoomId: true,
        liveRoomItemId: true,
        variantId: true,
        quantity: true,
        paymentStatus: true,
        fulfillmentOrderId: true,
        stripePaymentIntentId: true,
        revealedLabel: true,
        revealedAbbr: true,
      },
    });
    if (!p) throw new SpotFixError("NOT_FOUND", 404);
    if (p.fulfillmentOrderId) throw new SpotFixError("ORDER_EXISTS", 409);
    if (p.paymentStatus === "cancelled" || p.paymentStatus === "failed") throw new SpotFixError("ALREADY_RELEASED", 409);
    if (p.stripePaymentIntentId && p.paymentStatus === "paid") throw new SpotFixError("CARD_PAID_USE_REFUND", 409);

    const v = await tx.liveItemVariant.findUnique({
      where: { id: p.variantId },
      select: { quantityInitial: true, quantityRemaining: true, soldCount: true, status: true },
    });
    if (!v) throw new SpotFixError("VARIANT_NOT_FOUND", 404);

    const restore = Math.max(1, p.quantity);
    const wasPaid = p.paymentStatus === "paid";
    const nextRemaining = Math.min(v.quantityInitial, v.quantityRemaining + restore);
    await tx.liveItemVariant.update({
      where: { id: p.variantId },
      data: {
        quantityRemaining: nextRemaining,
        // soldCount only counted settled sales.
        soldCount: wasPaid ? Math.max(0, v.soldCount - restore) : v.soldCount,
        status: v.status === "sold_out" && nextRemaining > 0 ? "available" : v.status,
      },
    });
    // Clear the reveal so the same spot label can be sold again (unique per item + label).
    await tx.liveItemVariantPurchase.update({
      where: { id: p.id },
      data: { paymentStatus: "cancelled", revealedLabel: null, revealedAbbr: null },
    });
    await tx.liveRoomItem.update({ where: { id: p.liveRoomItemId }, data: { itemVersion: { increment: 1 } } });
    await tx.liveRoom.update({ where: { id: p.liveRoomId }, data: { roomVersion: { increment: 1 } } });

    await logAdminAction(
      {
        adminUserId: args.adminUserId,
        action: "spot.release",
        targetType: "purchase",
        targetId: p.id,
        targetUserId: p.buyerId,
        reason: args.reason,
        detail: {
          liveRoomId: p.liveRoomId,
          variantId: p.variantId,
          previousStatus: p.paymentStatus,
          previousRevealedLabel: p.revealedLabel,
          previousRevealedAbbr: p.revealedAbbr,
        },
      },
      tx as never,
    );
    return { purchaseId: p.id, variantId: p.variantId };
  });
}
