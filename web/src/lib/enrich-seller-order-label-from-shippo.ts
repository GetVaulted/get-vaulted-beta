import { prisma } from "@/lib/prisma";
import { orderHasPurchasedLabel } from "@/lib/seller-shipping-label-state";
import { isShippoConfigured, shippoGetTransaction, type ShippoTransaction } from "@/lib/shippo";

export type OrderLabelRepairFields = {
  id: string;
  shippoTransactionId: string | null;
  labelUrl: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippingStatus: string | null;
  fulfillmentStatus: string;
  labelCreatedAt?: Date | null;
};

export function sellerOrderLabelNeedsRepair(
  order: Pick<OrderLabelRepairFields, "shippoTransactionId" | "labelUrl" | "labelCreatedAt" | "fulfillmentStatus">,
): boolean {
  if (order.labelUrl?.trim()) return false;
  if (order.shippoTransactionId?.trim()) return true;
  return Boolean(order.labelCreatedAt && orderHasPurchasedLabel(order));
}

function patchFromShippoTransaction(
  order: OrderLabelRepairFields,
  tx: ShippoTransaction,
): Partial<OrderLabelRepairFields> | null {
  const labelUrl = tx.label_url?.trim() || null;
  const trackingNumber = tx.tracking_number?.trim() || null;
  const trackingUrl = tx.tracking_url_provider?.trim() || null;
  const shippingStatus = tx.status?.trim() || null;

  const changed =
    (labelUrl && labelUrl !== order.labelUrl) ||
    (trackingNumber && trackingNumber !== order.trackingNumber) ||
    (trackingUrl && trackingUrl !== order.trackingUrl) ||
    (shippingStatus && shippingStatus !== order.shippingStatus);

  if (!changed) return null;

  const fulfillmentStatus =
    labelUrl && order.fulfillmentStatus === "exception" ? "label_created" : order.fulfillmentStatus;

  return {
    labelUrl: labelUrl ?? order.labelUrl,
    trackingNumber: trackingNumber ?? order.trackingNumber,
    trackingUrl: trackingUrl ?? order.trackingUrl,
    shippingStatus: shippingStatus ?? order.shippingStatus,
    fulfillmentStatus,
  };
}

/** Fetch Shippo transaction and persist label URL / tracking when DB row is incomplete. */
export async function enrichSellerOrderLabelFromShippo<T extends OrderLabelRepairFields>(
  order: T,
): Promise<T> {
  if (!sellerOrderLabelNeedsRepair(order)) return order;
  if (!isShippoConfigured()) return order;

  const txId = order.shippoTransactionId?.trim();
  if (!txId) return order;

  try {
    const tx = await shippoGetTransaction(txId);
    const patch = patchFromShippoTransaction(order, tx);
    if (!patch) return order;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        labelUrl: patch.labelUrl,
        trackingNumber: patch.trackingNumber,
        trackingUrl: patch.trackingUrl,
        shippingStatus: patch.shippingStatus,
        fulfillmentStatus: patch.fulfillmentStatus,
      },
    });

    return { ...order, ...patch };
  } catch (e) {
    console.warn("[repair-seller-order-label] Shippo fetch failed", {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return order;
  }
}

/** Clear a broken Shippo transaction and purchase a fresh label. */
export async function regenerateSellerOrderShippingLabel(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      paymentStatus: true,
      labelUrl: true,
      shippoTransactionId: true,
      trackingNumber: true,
      trackingUrl: true,
      shippingStatus: true,
      fulfillmentStatus: true,
      labelCreatedAt: true,
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.paymentStatus !== "paid") throw new Error("UNPAID");
  if (order.labelUrl?.trim()) throw new Error("LABEL_EXISTS");

  const afterRepair = await enrichSellerOrderLabelFromShippo(order);
  if (afterRepair.labelUrl?.trim()) return;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      shippoTransactionId: null,
      shippoShipmentId: null,
      shippingStatus: null,
      fulfillmentStatus: "pending",
      labelCreatedAt: null,
    },
  });

  const { fulfillOrderShippingAfterPayment } = await import("@/services/shipping");
  await fulfillOrderShippingAfterPayment(orderId);
}
