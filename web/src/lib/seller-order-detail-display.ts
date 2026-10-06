import { orderHasLabelFile, orderHasPurchasedLabel } from "@/lib/seller-shipping-label-state";

export type SellerOrderDisplayFields = {
  paymentStatus: string;
  fulfillmentStatus: string;
  status: string;
  sellerNextAction?: string;
  labelUrl?: string | null;
  shippoTransactionId?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
};

export function formatSellerPaymentStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function formatSellerFulfillmentStatus(status: string): string {
  const map: Record<string, string> = {
    pending: "Pending",
    label_created: "Label ready",
    shipped: "Shipped",
    in_transit: "On the way",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    exception: "Label error",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

export function resolveSellerOrderHeadline(order: SellerOrderDisplayFields): {
  headline: string;
  subheadline: string;
} {
  const hasLabel = orderHasPurchasedLabel(order);
  const hasFile = orderHasLabelFile(order.labelUrl);
  const fs = order.fulfillmentStatus;

  if (order.paymentStatus !== "paid") {
    return {
      headline: "Awaiting buyer payment",
      subheadline: order.sellerNextAction?.trim() || "Fulfillment unlocks after payment clears.",
    };
  }
  if (hasLabel && hasFile && fs === "label_created") {
    return { headline: "Print label & mark shipped", subheadline: "Print the label, pack the item, then mark shipped when you drop it off." };
  }
  if (hasLabel && !hasFile) {
    return {
      headline: "Label file missing",
      subheadline: "Retrieve from Shippo or regenerate a new label to continue.",
    };
  }
  if (fs === "shipped") {
    return {
      headline: "Shipped — awaiting carrier scan",
      subheadline: "Status updates to on the way when the carrier scans the package in.",
    };
  }
  if (fs === "in_transit" || fs === "out_for_delivery") {
    return {
      headline: formatSellerFulfillmentStatus(fs),
      subheadline: order.trackingNumber?.trim()
        ? `Tracking ${order.trackingNumber.trim()}`
        : "Carrier updates will appear here.",
    };
  }
  if (fs === "exception") {
    return {
      headline: "Label could not be created",
      subheadline:
        "Check the ship-to address below. If it looks wrong, ask the buyer to open the order and tap Update from Wallet (before a label is created).",
    };
  }
  if (fs === "delivered") {
    return { headline: "Delivered", subheadline: "Payout moves through hold after delivery confirmation." };
  }
  if (!hasLabel) {
    return {
      headline: "Create shipping label",
      subheadline: "Use the shipping panel below when the buyer address is complete.",
    };
  }
  return {
    headline: formatSellerFulfillmentStatus(fs),
    subheadline: order.sellerNextAction?.trim() || "Review fulfillment details below.",
  };
}

export type SellerQuickActionKind =
  | "print_label"
  | "download_label"
  | "copy_tracking"
  | "open_tracking"
  | "retrieve_label"
  | "regenerate_label"
  | "create_label";

export type SellerQuickAction = {
  kind: SellerQuickActionKind;
  label: string;
  primary?: boolean;
};

export function resolveSellerQuickActions(
  order: SellerOrderDisplayFields & { canCreateLabel?: boolean },
): SellerQuickAction[] {
  const hasLabel = orderHasPurchasedLabel(order);
  const hasFile = orderHasLabelFile(order.labelUrl);
  const actions: SellerQuickAction[] = [];

  if (hasFile && order.labelUrl?.trim()) {
    actions.push({ kind: "print_label", label: "Print label", primary: true });
    actions.push({ kind: "download_label", label: "Download label" });
  }
  if (order.trackingNumber?.trim()) {
    actions.push({ kind: "copy_tracking", label: "Copy tracking" });
  }
  if (order.trackingUrl?.trim()) {
    actions.push({ kind: "open_tracking", label: "Open tracking" });
  }
  if (hasLabel && !hasFile) {
    if (order.shippoTransactionId?.trim()) {
      actions.push({ kind: "retrieve_label", label: "Retry label lookup", primary: true });
    }
    actions.push({ kind: "regenerate_label", label: "Regenerate label", primary: !order.shippoTransactionId?.trim() });
  } else if (order.canCreateLabel) {
    actions.push({ kind: "create_label", label: "Create label", primary: true });
  }

  return actions;
}
