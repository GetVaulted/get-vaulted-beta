import { prisma } from "@/lib/prisma";

const OPEN_ORDER_STATUSES = new Set(["pending", "paid", "processing"]);
const OPEN_FULFILLMENT = new Set(["pending", "processing", "label_purchased"]);

/** True when the user has buyer or seller orders that are not fully settled. */
export async function userHasOpenOrders(userId: string): Promise<boolean> {
  const [openBuyerOrders, openSellerOrders] = await Promise.all([
    prisma.order.count({
      where: {
        buyerId: userId,
        OR: [{ status: { in: [...OPEN_ORDER_STATUSES] } }, { fulfillmentStatus: { in: [...OPEN_FULFILLMENT] } }],
      },
    }),
    prisma.order.count({
      where: {
        sellerId: userId,
        OR: [{ status: { in: [...OPEN_ORDER_STATUSES] } }, { fulfillmentStatus: { in: [...OPEN_FULFILLMENT] } }],
      },
    }),
  ]);
  return openBuyerOrders > 0 || openSellerOrders > 0;
}
