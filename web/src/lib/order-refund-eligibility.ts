/** Max time after delivery to request a shipping-defect return on live orders (2 days). */
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
  /** Get Vaulted / Shippo label PDF URL when a platform label was purchased. */
  labelUrl?: string | null;
  /** Shippo transaction id when a platform label was purchased. */
  shippoTransactionId?: string | null;
};

export type LiveOrderRefundEligibility = {
  kind: LiveOrderRefundKind | null;
  blockedReason: string | null;
};

export function orderHasPurchasedShippingLabel(order: {
  labelUrl?: string | null;
  shippoTransactionId?: string | null;
}): boolean {
  return Boolean(order.labelUrl?.trim() || order.shippoTransactionId?.trim());
}

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

/**
 * Cancel / return eligibility for paid orders.
 * - Marketplace: cancel only, before ship and before a Get Vaulted label.
 * - Live show: cancel before ship/transit; return within 2 days of delivery (shipping defect).
 */
export function resolveLiveOrderRefundEligibility(order: LiveOrderRefundGateInput): LiveOrderRefundEligibility {
  if (order.paymentMethod === "escrow") {
    return { kind: null, blockedReason: "ESCROW_NOT_SUPPORTED" };
  }
  if (order.paymentStatus === "refunded") {
    return { kind: null, blockedReason: "ALREADY_REFUNDED" };
  }
  if (order.paymentStatus !== "paid") {
    return { kind: null, blockedReason: "NOT_PAID" };
  }

  const isLive = Boolean(order.liveShowId?.trim());
  const inTransit = orderIsInTransitForRefund(order);
  const delivered = orderIsDeliveredForRefund(order);
  const hasLabel = orderHasPurchasedShippingLabel(order);

  if (!isLive) {
    // Marketplace: cancel only, and only before ship / platform label.
    if (delivered || inTransit) {
      return { kind: null, blockedReason: inTransit && !delivered ? "IN_TRANSIT" : "NOT_ELIGIBLE" };
    }
    if (hasLabel) {
      return { kind: null, blockedReason: "LABEL_EXISTS" };
    }
    return { kind: "cancel", blockedReason: null };
  }

  // Live show orders
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
  "refund_processing",
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
    case "refund_processing":
      return "Refund processing";
    case "support_denied":
      return "Support denied";
    case "refunded":
      return "Refunded";
    default:
      return status.replace(/_/g, " ");
  }
}
