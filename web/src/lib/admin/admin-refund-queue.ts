import { OrderRefundRequestStatus } from "@/generated/prisma/client";
import { serializeOrderRefundRequest } from "@/lib/order-refund-types";
import { prisma } from "@/lib/prisma";

export const OPEN_REFUND_STATUSES: OrderRefundRequestStatus[] = [
  OrderRefundRequestStatus.escalated,
  OrderRefundRequestStatus.pending_seller,
  OrderRefundRequestStatus.seller_denied,
  OrderRefundRequestStatus.awaiting_return,
  OrderRefundRequestStatus.return_in_transit,
  OrderRefundRequestStatus.refund_processing,
];

export const CLOSED_REFUND_STATUSES: OrderRefundRequestStatus[] = [
  OrderRefundRequestStatus.refunded,
  OrderRefundRequestStatus.support_denied,
];

const CLOSED_LOOKBACK_DAYS = 30;

/** What an admin is allowed to do to a request in each status (server also enforces this). */
export function adminRefundActionsFor(status: OrderRefundRequestStatus): Array<"approve" | "deny" | "force_refund" | "retry"> {
  switch (status) {
    case OrderRefundRequestStatus.escalated:
      return ["approve", "deny", "force_refund"];
    case OrderRefundRequestStatus.pending_seller:
    case OrderRefundRequestStatus.seller_denied:
    case OrderRefundRequestStatus.awaiting_return:
    case OrderRefundRequestStatus.return_in_transit:
      return ["force_refund"];
    case OrderRefundRequestStatus.refund_processing:
      return ["retry"];
    default:
      return [];
  }
}

export async function listAdminRefundQueue(limit = 200) {
  const since = new Date(Date.now() - CLOSED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.orderRefundRequest.findMany({
    where: {
      OR: [
        { status: { in: OPEN_REFUND_STATUSES } },
        { status: { in: CLOSED_REFUND_STATUSES }, updatedAt: { gte: since } },
      ],
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    include: {
      order: {
        select: {
          id: true,
          totalUsd: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          listing: { select: { title: true } },
        },
      },
      buyer: { select: { id: true, username: true } },
      seller: { select: { id: true, username: true } },
    },
  });

  return rows.map((r) => ({
    ...serializeOrderRefundRequest(r),
    orderTotalUsd: r.order.totalUsd,
    orderPaymentStatus: r.order.paymentStatus,
    orderFulfillmentStatus: r.order.fulfillmentStatus,
    listingTitle: r.order.listing.title,
    buyerId: r.buyer.id,
    sellerId: r.seller.id,
    buyerUsername: r.buyer.username,
    sellerUsername: r.seller.username,
    isOpen: OPEN_REFUND_STATUSES.includes(r.status),
    stuckForMs:
      r.status === OrderRefundRequestStatus.refund_processing ? Date.now() - r.updatedAt.getTime() : null,
    allowedActions: adminRefundActionsFor(r.status),
  }));
}
