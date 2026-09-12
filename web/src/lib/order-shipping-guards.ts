/** Keep in sync with PAYMENT_PAID in @/services/payments — do not import payments here (client bundle). */
const PAYMENT_PAID = "paid";
import { PAYMENT_LAYAWAY_ACTIVE } from "@/lib/layaway/constants";

export const ORDER_MUST_BE_PAID_BEFORE_FULFILLMENT = "Order must be paid before fulfillment.";

/** Layaway orders cannot ship until the plan is fully paid. */
export function orderBlocksFulfillmentForLayaway(order: { paymentStatus: string }): boolean {
  return order.paymentStatus === PAYMENT_LAYAWAY_ACTIVE;
}

/** Seller sales UI: show mark-shipped, create-label, and related fulfillment controls. */
export function sellerMayShowFulfillmentControls(order: { paymentStatus: string }): boolean {
  return order.paymentStatus === PAYMENT_PAID && !orderBlocksFulfillmentForLayaway(order);
}

/** PATCH markShipped — payment must be paid; lifecycle status must allow first ship. */
export function sellerMayMarkOrderShipped(order: {
  paymentStatus: string;
  status: string;
}): { ok: true } | { ok: false; code: "UNPAID" | "INVALID_STATUS" } {
  if (order.paymentStatus !== PAYMENT_PAID) return { ok: false, code: "UNPAID" };
  if (order.status !== "pending" && order.status !== "paid") {
    return { ok: false, code: "INVALID_STATUS" };
  }
  return { ok: true };
}

/** Pure guards for label creation (mirrors API rules; used in tests). */
export function canSellerCreateShippingLabel(order: {
  paymentStatus: string;
  shippoTransactionId: string | null;
  labelUrl: string | null;
  fulfillmentStatus?: string;
}): { ok: true } | { ok: false; code: "UNPAID" | "LABEL_EXISTS" } {
  if (order.paymentStatus !== PAYMENT_PAID || orderBlocksFulfillmentForLayaway(order)) {
    return { ok: false, code: "UNPAID" };
  }
  if (order.labelUrl?.trim()) return { ok: false, code: "LABEL_EXISTS" };
  if (
    order.shippoTransactionId?.trim() &&
    order.fulfillmentStatus !== "exception"
  ) {
    return { ok: false, code: "LABEL_EXISTS" };
  }
  return { ok: true };
}

/** True when order ship-to is a placeholder or missing fields required for Shippo. */
export function isIncompleteOrderShipping(order: {
  shipAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
}): boolean {
  const addr = (order.shipAddress ?? "").trim();
  const city = (order.shipCity ?? "").trim();
  const state = (order.shipState ?? "").trim();
  const zip = (order.shipZip ?? "").trim();
  if (!addr || !city || !state || !zip) return true;
  if (zip === "00000") return true;
  const lower = addr.toLowerCase();
  if (lower.includes("coordinate shipping")) return true;
  if (city === "—" || city === "-") return true;
  if (state === "—" || state === "-") return true;
  return false;
}

/**
 * Buyer may replace order ship-to from Wallet only before a label ships.
 * Paid orders with a complete-but-wrong address are included.
 */
export function canBuyerUpdateOrderShipping(order: {
  status: string;
  labelUrl: string | null;
  shippoTransactionId: string | null;
  fulfillmentStatus?: string | null;
  trackingNumber?: string | null;
}): { ok: true } | { ok: false; code: "LABEL_EXISTS" | "ALREADY_SHIPPED" | "TERMINAL" } {
  const status = (order.status ?? "").trim().toLowerCase();
  if (
    status === "cancelled" ||
    status === "canceled" ||
    status === "delivered" ||
    status === "completed"
  ) {
    return { ok: false, code: "TERMINAL" };
  }
  if (status === "shipped" || order.trackingNumber?.trim()) {
    return { ok: false, code: "ALREADY_SHIPPED" };
  }
  if (order.labelUrl?.trim()) return { ok: false, code: "LABEL_EXISTS" };
  if (order.shippoTransactionId?.trim() && order.fulfillmentStatus !== "exception") {
    return { ok: false, code: "LABEL_EXISTS" };
  }
  return { ok: true };
}
