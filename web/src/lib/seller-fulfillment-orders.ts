import { LayawayStatus, type Prisma } from "@/generated/prisma/client";
import { orderQualifiesForSellerFulfillment } from "@/lib/marketplace/layaway-commerce-state";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";
import { PAYMENT_PAID } from "@/services/payments";

/** Prisma filter: seller orders eligible for Sales / Fulfillment (excludes in-progress layaways). */
export function sellerFulfillmentOrdersWhere(sellerId: string): Prisma.OrderWhereInput {
  return {
    sellerId,
    OR: [
      { paymentStatus: PAYMENT_PAID },
      {
        AND: [
          { paymentStatus: { not: PAYMENT_LAYAWAY_ACTIVE } },
          {
            OR: [{ layaway: null }, { layaway: { status: { not: LayawayStatus.active } } }],
          },
        ],
      },
    ],
  };
}

export function isSellerFulfillmentOrder(order: {
  paymentStatus: string;
  layawayStatus?: string | null;
  listingStatus?: string | null;
  remainingBalanceUsd?: number | null;
}): boolean {
  return orderQualifiesForSellerFulfillment(order);
}
