import type { Prisma } from "@/generated/prisma/client";

/**
 * Handling / ship-delay clock start for an order.
 * - Marketplace: purchase time (`order.createdAt`)
 * - Live-show linked: show `endedAt` only — clock does not run while the show is still open
 *   (including pre-show Buy Now / PYT sales).
 * Returns `null` when the live show has not ended yet (clock not started).
 */
export function resolveOrderHandlingClockStartAt(args: {
  orderCreatedAt: Date;
  isLiveShowLinked: boolean;
  liveShowEndedAt: Date | null | undefined;
}): Date | null {
  if (!args.isLiveShowLinked) return args.orderCreatedAt;
  return args.liveShowEndedAt ?? null;
}

export function isOrderPastExcessiveShippingDelay(args: {
  orderCreatedAt: Date;
  isLiveShowLinked: boolean;
  liveShowEndedAt: Date | null | undefined;
  now?: Date;
  /** Defaults to 7 to match payout standing. */
  delayDays?: number;
}): boolean {
  const start = resolveOrderHandlingClockStartAt(args);
  if (!start) return false;
  const now = args.now ?? new Date();
  const days = args.delayDays ?? 7;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return start.getTime() < cutoff.getTime();
}

/** Prisma `where` for unpaid-ship overdue count used by payout standing. */
export function excessiveShippingDelayOrderWhere(
  sellerId: string,
  delayCutoff: Date,
): Prisma.OrderWhereInput {
  const liveShowEndedBeforeCutoff: Prisma.LiveRoomWhereInput = {
    endedAt: { not: null, lt: delayCutoff },
  };

  return {
    sellerId,
    paymentStatus: "paid",
    fulfillmentStatus: { in: ["pending", "label_created"] },
    OR: [
      // Marketplace / non-live: clock from purchase day.
      {
        liveShippingSessionId: null,
        breakSpotFulfillment: { is: null },
        variantPurchaseFulfillment: { none: {} },
        createdAt: { lt: delayCutoff },
      },
      // Live shipping session: clock from show end.
      {
        liveShippingSession: {
          is: { liveShow: liveShowEndedBeforeCutoff },
        },
      },
      // Break-spot fulfillment without a session row.
      {
        breakSpotFulfillment: {
          is: { liveRoom: liveShowEndedBeforeCutoff },
        },
      },
      // PYT / variant fulfillment without a session row.
      {
        variantPurchaseFulfillment: {
          some: { liveRoom: liveShowEndedBeforeCutoff },
        },
      },
    ],
  };
}
