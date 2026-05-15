/** Pure guards for label creation (mirrors API rules; used in tests). */
export function canSellerCreateShippingLabel(order: {
  paymentStatus: string;
  shippoTransactionId: string | null;
  labelUrl: string | null;
}): { ok: true } | { ok: false; code: "UNPAID" | "LABEL_EXISTS" } {
  if (order.paymentStatus !== "paid") return { ok: false, code: "UNPAID" };
  if (order.shippoTransactionId || order.labelUrl) return { ok: false, code: "LABEL_EXISTS" };
  return { ok: true };
}
