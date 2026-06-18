/** Max time after delivery to request a shipping-defect return (2 days). */
export const LIVE_ORDER_RETURN_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export type LiveOrderRefundKind = "cancel" | "return";

export type LiveOrderRefundGateInput = {
  paymentStatus: string;
  paymentMethod: string;
  status: string;
  fulfillmentStatus: string;
  shippedAt: Date | null;
  deliveryConfirmedAt: Date | null;
  liveShowId: string | null;
};

export type LiveOrderRefundEligibility = {
  kind: LiveOrderRefundKind | null;
  blockedReason: string | null;
};

export function orderIsInTransitForRefund(order: Pick<LiveOrderRefundGateInput, "status" | "fulfillmentStatus">): boolean {
  return (
    order.status === "shipped" ||
    order.fulfillmentStatus === "in_transit" ||
    order.fulfillmentStatus === "out_for_delivery"
  );
}

export function orderIsDeliveredForRefund(
  order: Pick<LiveOrderRefundGateInput, "status" | "fulfillmentStatus" | "deliveryConfirmedAt">,
): boolean {
  return (
    order.status === "delivered" ||
    order.fulfillmentStatus === "delivered" ||
    order.deliveryConfirmedAt != null
  );
}

export function resolveLiveOrderRefundEligibility(order: LiveOrderRefundGateInput): LiveOrderRefundEligibility {
  if (!order.liveShowId) {
    return { kind: null, blockedReason: "NOT_LIVE_ORDER" };
  }
  if (order.paymentMethod === "escrow") {
    return { kind: null, blockedReason: "ESCROW_NOT_SUPPORTED" };
  }
  if (order.paymentStatus === "refunded") {
    return { kind: null, blockedReason: "ALREADY_REFUNDED" };
  }
  if (order.paymentStatus !== "paid") {
    return { kind: null, blockedReason: "NOT_PAID" };
  }

  const inTransit = orderIsInTransitForRefund(order);
  const delivered = orderIsDeliveredForRefund(order);

  if (!delivered && !inTransit) {
    return { kind: "cancel", blockedReason: null };
  }

  if (inTransit && !delivered) {
    return { kind: null, blockedReason: "IN_TRANSIT" };
  }

  if (delivered) {
    const deliveredAt = order.deliveryConfirmedAt ?? order.shippedAt;
    if (deliveredAt) {
      const elapsed = Date.now() - deliveredAt.getTime();
      if (elapsed > LIVE_ORDER_RETURN_WINDOW_MS) {
        return { kind: null, blockedReason: "RETURN_WINDOW_EXPIRED" };
      }
    }
    return { kind: "return", blockedReason: null };
  }

  return { kind: null, blockedReason: "NOT_ELIGIBLE" };
}

export const ACTIVE_REFUND_REQUEST_STATUSES = new Set([
  "pending_seller",
  "seller_denied",
  "escalated",
  "awaiting_return",
  "return_in_transit",
]);

export function refundRequestStatusLabel(status: string): string {
  switch (status) {
    case "pending_seller":
      return "Awaiting seller";
    case "seller_denied":
      return "Denied by seller";
    case "escalated":
      return "With Get Vaulted support";
    case "awaiting_return":
      return "Approved — ship item back";
    case "return_in_transit":
      return "Return in transit";
    case "support_denied":
      return "Support denied";
    case "refunded":
      return "Refunded";
    default:
      return status.replace(/_/g, " ");
  }
}
