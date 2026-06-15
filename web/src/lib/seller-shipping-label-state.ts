const LABEL_PURCHASED_FULFILLMENT = new Set([
  "label_created",
  "in_transit",
  "out_for_delivery",
  "delivered",
]);

export type SellerLabelOrderFields = {
  shippoTransactionId?: string | null;
  labelUrl?: string | null;
  fulfillmentStatus?: string;
};

export function orderHasPurchasedLabel(order: SellerLabelOrderFields): boolean {
  if (order.shippoTransactionId?.trim() || order.labelUrl?.trim()) return true;
  return LABEL_PURCHASED_FULFILLMENT.has(order.fulfillmentStatus ?? "");
}

export function orderHasLabelFile(labelUrl?: string | null): boolean {
  return Boolean(labelUrl?.trim());
}

export function sellerTrackingStatusLabel(
  fulfillmentStatus: string,
  shippingStatus?: string | null,
): string {
  const ship = shippingStatus?.trim();
  if (ship && ship !== "label_error") {
    return ship.replace(/_/g, " ");
  }
  switch (fulfillmentStatus) {
    case "label_created":
      return "Label created";
    case "in_transit":
      return "In transit";
    case "out_for_delivery":
      return "Out for delivery";
    case "delivered":
      return "Delivered";
    case "exception":
      return "Shipping exception";
    default:
      return fulfillmentStatus.replace(/_/g, " ") || "—";
  }
}

export function openLabelForPrint(labelUrl: string): void {
  const w = window.open(labelUrl, "_blank", "noopener,noreferrer");
  if (!w) return;
  try {
    w.addEventListener("load", () => {
      w.focus();
      w.print();
    });
  } catch {
    /* cross-origin PDF may block print(); new tab is enough */
  }
}

export async function copyTrackingNumber(trackingNumber: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(trackingNumber);
    return true;
  } catch {
    return false;
  }
}
