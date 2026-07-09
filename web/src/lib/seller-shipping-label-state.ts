/**
 * Seller shipping label helpers — print, tracking copy, purchased-state checks.
 */
import {
  buildLabelPrintPagePath,
  readStoredLabelPrintFormat,
  storeLabelPrintFormat,
  type SellerLabelPrintFormat,
} from "@/lib/shippo-label-format";

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
  if (ship) {
    const upper = ship.toUpperCase();
    if (upper === "ERROR" || upper === "LABEL_ERROR") {
      return "Label error";
    }
    if (ship !== "label_error") {
      return ship.replace(/_/g, " ");
    }
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

export function openLabelForPrint(
  labelUrl: string,
  format: SellerLabelPrintFormat = readStoredLabelPrintFormat(),
): void {
  storeLabelPrintFormat(format);
  const target =
    format === "thermal_4x6" ? buildLabelPrintPagePath(labelUrl, format) : labelUrl;
  const w = window.open(target, "_blank", "noopener,noreferrer");
  if (!w) return;
  if (format === "thermal_4x6") return;
  try {
    w.addEventListener("load", () => {
      w.focus();
      w.print();
    });
  } catch {
    /* cross-origin PDF may block print(); new tab is enough */
  }
}

export { type SellerLabelPrintFormat } from "@/lib/shippo-label-format";

export async function copyTrackingNumber(trackingNumber: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(trackingNumber);
    return true;
  } catch {
    return false;
  }
}
