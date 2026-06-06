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
}): { ok: true } | { ok: false; code: "UNPAID" | "LABEL_EXISTS" } {
  if (order.paymentStatus !== PAYMENT_PAID || orderBlocksFulfillmentForLayaway(order)) {
    return { ok: false, code: "UNPAID" };
  }
  if (order.shippoTransactionId || order.labelUrl) return { ok: false, code: "LABEL_EXISTS" };
  return { ok: true };
}
