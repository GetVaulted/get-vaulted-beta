import { prisma } from "@/lib/prisma";

/** Stable `SellerCommerceEvent.kind` values for filtering. */
export const SELLER_COMMERCE_KIND = {
  auctionWinnerPaymentExpired: "auction_winner_payment_expired",
  recoveryNextBidder: "recovery_next_bidder",
  recoveryRelist: "recovery_relist",
  recoveryCancel: "recovery_cancel",
  fulfillmentLabelCreated: "fulfillment_label_created",
  fulfillmentTrackingAdded: "fulfillment_tracking_added",
  fulfillmentInTransit: "fulfillment_in_transit",
  fulfillmentDelivered: "fulfillment_delivered",
  fulfillmentException: "fulfillment_exception",
  orderRefundRequested: "order_refund_requested",
  orderRefundApproved: "order_refund_approved",
  orderRefundDenied: "order_refund_denied",
  orderRefunded: "order_refunded",
} as const;

export async function logSellerCommerceEvent(args: {
  sellerId: string;
  listingId?: string | null;
  orderId?: string | null;
  kind: string;
  title: string;
  body: string;
}): Promise<void> {
  await prisma.sellerCommerceEvent.create({
    data: {
      sellerId: args.sellerId,
      listingId: args.listingId ?? null,
      orderId: args.orderId ?? null,
      kind: args.kind,
      title: args.title,
      body: args.body,
    },
  });
}
