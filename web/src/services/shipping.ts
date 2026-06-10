import { createNotification } from "@/lib/notifications";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { prisma } from "@/lib/prisma";
import { isShippoConfigured, shippoCreateShipment, shippoListRates, shippoPurchaseRate, type ShippoAddress, type ShippoParcel } from "@/lib/shippo";

const DEFAULT_PARCEL: ShippoParcel = {
  length: "10",
  width: "8",
  height: "4",
  distance_unit: "in",
  weight: "16",
  mass_unit: "oz",
};

function parcelFromListing(w?: number | null, l?: number | null, wi?: number | null, h?: number | null): ShippoParcel {
  if (w != null && l != null && wi != null && h != null && [w, l, wi, h].every((n) => Number.isFinite(n) && n > 0)) {
    return {
      length: String(l),
      width: String(wi),
      height: String(h),
      distance_unit: "in",
      weight: String(Math.max(1, w)),
      mass_unit: "oz",
    };
  }
  return DEFAULT_PARCEL;
}

/**
 * After Stripe confirms payment, create Shippo shipment, pick a rate, buy label, persist tracking.
 * Skips when Shippo is not configured or seller origin / parcel data is missing.
 */
export async function fulfillOrderShippingAfterPayment(orderId: string): Promise<void> {
  if (!isShippoConfigured()) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          parcelWeightOz: true,
          parcelLengthIn: true,
          parcelWidthIn: true,
          parcelHeightIn: true,
        },
      },
      seller: {
        select: {
          shipFromStreet: true,
          shipFromCity: true,
          shipFromState: true,
          shipFromZip: true,
          shipFromCountry: true,
          shipFromName: true,
        },
      },
    },
  });
  if (!order) return;
  if (order.paymentStatus !== "paid") return;
  if (order.shippoTransactionId) return;

  const from = order.seller;
  if (!from.shipFromStreet || !from.shipFromCity || !from.shipFromState || !from.shipFromZip || !from.shipFromCountry) {
    console.warn(`[shippo] skip order ${orderId}: seller ship-from incomplete`);
    return;
  }

  const addressFrom: ShippoAddress = {
    name: from.shipFromName || "Seller",
    street1: from.shipFromStreet,
    city: from.shipFromCity,
    state: from.shipFromState,
    zip: from.shipFromZip,
    country: from.shipFromCountry,
  };
  const addressTo: ShippoAddress = {
    name: order.shipRecipientName,
    street1: order.shipAddress,
    city: order.shipCity,
    state: order.shipState,
    zip: order.shipZip,
    country: order.shipCountry,
  };

  const parcel = parcelFromListing(
    order.listing.parcelWeightOz,
    order.listing.parcelLengthIn,
    order.listing.parcelWidthIn,
    order.listing.parcelHeightIn,
  );

  try {
    const shipment = (await shippoCreateShipment({
      address_from: addressFrom,
      address_to: addressTo,
      parcels: [parcel],
      async: false,
    })) as { object_id?: string };

    const sid = shipment.object_id;
    if (!sid) throw new Error("Shippo shipment missing object_id");

    const ratesRes = (await shippoListRates(sid)) as { results?: { object_id?: string; amount?: string; provider?: string; servicelevel?: { name?: string } }[] };
    const rates = ratesRes.results ?? [];
    const cheapest = [...rates].sort((a, b) => Number(a.amount ?? 0) - Number(b.amount ?? 0))[0];
    if (!cheapest?.object_id) throw new Error("No Shippo rates");

    const shippingLabelCostCents = Math.round(Number(cheapest.amount ?? 0) * 100);

    const tx = (await shippoPurchaseRate(cheapest.object_id)) as {
      object_id?: string;
      tracking_number?: string;
      tracking_url_provider?: string;
      label_url?: string;
      status?: string;
    };

    const labelNow = new Date();
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shippoShipmentId: sid,
        shippoTransactionId: tx.object_id ?? cheapest.object_id,
        carrier: cheapest.provider ?? null,
        service: cheapest.servicelevel?.name ?? null,
        trackingNumber: tx.tracking_number ?? null,
        trackingUrl: tx.tracking_url_provider ?? null,
        labelUrl: tx.label_url ?? null,
        shippingStatus: tx.status ?? "UNKNOWN",
        fulfillmentStatus: "label_created",
        labelCreatedAt: labelNow,
        shippingLabelCostCents,
      },
    });
    const { processLabelCreatedPayoutEvaluation } = await import(
      "@/services/payout/process-payout-tier-events"
    );
    void processLabelCreatedPayoutEvaluation(orderId);
    const chargedCents =
      order.shippingChargedCents ?? Math.round(Math.max(0, order.shippingPriceUsd) * 100);
    console.info("[shipping economics]", {
      orderId,
      shippingChargedCents: chargedCents,
      shippingLabelCostCents,
    });
    const lt =
      order.listing.title.length > 80 ? `${order.listing.title.slice(0, 77)}…` : order.listing.title;
    const tn = tx.tracking_number ? ` Tracking: ${tx.tracking_number}.` : "";
    await logSellerCommerceEvent({
      sellerId: order.sellerId,
      listingId: order.listing.id,
      orderId: order.id,
      kind: SELLER_COMMERCE_KIND.fulfillmentLabelCreated,
      title: "Shipping label created",
      body: `A carrier label was purchased for “${lt}”.${tn}`,
    });
    await createNotification(prisma, {
      userId: order.buyerId,
      type: "order_label_created",
      title: "Shipping label created",
      body: `Your order for “${lt}” has a carrier label.${tn}`,
      href: `/orders/${encodeURIComponent(orderId)}`,
    });
    await createNotification(prisma, {
      userId: order.sellerId,
      type: "seller_label_created",
      title: "Label ready",
      body: `Your label for “${lt}” is ready to print.${tn}`,
      href: `/orders/${encodeURIComponent(orderId)}`,
    });
  } catch (e) {
    console.error(`[shippo] fulfill failed order ${orderId}`, e);
    await prisma.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus: "exception",
        shippingStatus: "label_error",
      },
    });
    const lt =
      order.listing.title.length > 80 ? `${order.listing.title.slice(0, 77)}…` : order.listing.title;
    const errMsg = e instanceof Error ? e.message : String(e);
    await logSellerCommerceEvent({
      sellerId: order.sellerId,
      listingId: order.listing.id,
      orderId: order.id,
      kind: SELLER_COMMERCE_KIND.fulfillmentException,
      title: "Shipping exception",
      body: `Shippo could not create a label for “${lt}”. ${errMsg.slice(0, 200)}`,
    });
  }
}

/** Map Shippo TRACK_UPDATED payloads to order fulfillmentStatus (best-effort). */
export function mapShippoTrackingToFulfillment(status: string | undefined): string | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s.includes("DELIVERED")) return "delivered";
  if (s.includes("TRANSIT") || s.includes("IN_TRANSIT")) return "in_transit";
  if (s.includes("FAIL") || s.includes("EXCEPTION") || s.includes("ERROR")) return "exception";
  if (s.includes("UNKNOWN")) return null;
  return "in_transit";
}
