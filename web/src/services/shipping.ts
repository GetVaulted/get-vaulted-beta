import { createNotification } from "@/lib/notifications";
import { scheduleOrderLifecycleEmail } from "@/lib/order-lifecycle-email";
import { emitOrderLifecycleSync } from "@/lib/marketplace/ecosystem-sync";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { prisma } from "@/lib/prisma";
import {
  assertBuyerShippoContact,
  assertSellerShippoContact,
  resolveBuyerShippoContact,
  resolveSellerShippoContact,
  withShippoContact,
} from "@/lib/shippo-label-contacts";
import { isShippoConfigured, shippoCreateShipment, shippoListRates, shippoPurchaseRate, type ShippoAddress } from "@/lib/shippo";
import { resolveMarketplaceQuoteParcel } from "@/lib/marketplace-parcel-defaults";
import { shippoLabelFileTypeForPrintFormat, type SellerLabelPrintFormat } from "@/lib/shippo-label-format";
import { resolveShippoPurchaseLabel } from "@/lib/shippo-transaction-label";

/**
 * Purchase a Shippo label for a paid order: create shipment, pick a rate, buy label, persist tracking.
 * Called when the seller explicitly creates a label from Sales (not automatically on payment).
 */
export async function fulfillOrderShippingAfterPayment(
  orderId: string,
  options?: {
    labelFormat?: SellerLabelPrintFormat;
    manualParcel?: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };
  },
): Promise<void> {
  if (!isShippoConfigured()) {
    throw new Error("SHIPPO_NOT_CONFIGURED");
  }

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
          shippingCategory: true,
          platformShippingProfile: {
            select: {
              defaultWeightOz: true,
              defaultLengthIn: true,
              defaultWidthIn: true,
              defaultHeightIn: true,
            },
          },
        },
      },
      seller: {
        select: {
          email: true,
          shipFromStreet: true,
          shipFromCity: true,
          shipFromState: true,
          shipFromZip: true,
          shipFromCountry: true,
          shipFromName: true,
          defaultShipFromAddress: {
            select: { email: true, phone: true },
          },
        },
      },
      buyer: {
        select: { email: true },
      },
      buyerAddress: {
        select: { email: true, phone: true },
      },
      sellerShipFromAddress: {
        select: { email: true, phone: true },
      },
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.paymentStatus !== "paid") throw new Error("ORDER_NOT_PAID");
  if (order.shippoTransactionId) {
    if (order.labelUrl?.trim()) return;
    const { enrichSellerOrderLabelFromShippo } = await import("@/lib/enrich-seller-order-label-from-shippo");
    const repaired = await enrichSellerOrderLabelFromShippo({
      id: order.id,
      shippoTransactionId: order.shippoTransactionId,
      labelUrl: order.labelUrl,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      shippingStatus: order.shippingStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      labelCreatedAt: order.labelCreatedAt,
    });
    if (repaired.labelUrl?.trim()) return;
    if (order.fulfillmentStatus === "exception") {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          shippoTransactionId: null,
          shippoShipmentId: null,
          carrier: null,
          service: null,
          trackingNumber: null,
          trackingUrl: null,
          shippingStatus: null,
          fulfillmentStatus: "pending",
          labelCreatedAt: null,
        },
      });
    } else {
      return;
    }
  }

  const from = order.seller;
  if (!from.shipFromStreet || !from.shipFromCity || !from.shipFromState || !from.shipFromZip || !from.shipFromCountry) {
    throw new Error("SELLER_SHIP_FROM_INCOMPLETE");
  }

  const sellerContact = resolveSellerShippoContact({
    userEmail: from.email,
    addressEmail: order.sellerShipFromAddress?.email ?? from.defaultShipFromAddress?.email,
    addressPhone: order.sellerShipFromAddress?.phone ?? from.defaultShipFromAddress?.phone,
  });
  assertSellerShippoContact(sellerContact);

  const buyerContact = resolveBuyerShippoContact({
    userEmail: order.buyer.email,
    addressEmail: order.buyerAddress?.email,
    addressPhone: order.buyerAddress?.phone,
  });
  assertBuyerShippoContact(buyerContact);

  const addressFrom: ShippoAddress = withShippoContact(
    {
      name: from.shipFromName || "Seller",
      street1: from.shipFromStreet,
      city: from.shipFromCity,
      state: from.shipFromState,
      zip: from.shipFromZip,
      country: from.shipFromCountry,
    },
    sellerContact,
  );
  const addressTo: ShippoAddress = withShippoContact(
    {
      name: order.shipRecipientName,
      street1: order.shipAddress,
      city: order.shipCity,
      state: order.shipState,
      zip: order.shipZip,
      country: order.shipCountry,
    },
    buyerContact,
  );

  const parcel = options?.manualParcel
    ? {
        weight: String(options.manualParcel.weightOz),
        length: String(options.manualParcel.lengthIn),
        width: String(options.manualParcel.widthIn),
        height: String(options.manualParcel.heightIn),
        distance_unit: "in" as const,
        mass_unit: "oz" as const,
      }
    : resolveMarketplaceQuoteParcel(order.listing);

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
    const preferred =
      order.carrier && order.service
        ? rates.find(
            (r) =>
              (r.provider ?? "").trim() === order.carrier &&
              (r.servicelevel?.name ?? "").trim() === order.service,
          )
        : undefined;
    const picked = preferred ?? cheapest;
    if (!picked?.object_id) throw new Error("No Shippo rates");

    const shippingLabelCostCents = Math.round(Number(picked.amount ?? 0) * 100);

    const tx = (await shippoPurchaseRate(
      picked.object_id,
      shippoLabelFileTypeForPrintFormat(options?.labelFormat ?? "thermal_4x6"),
    )) as {
      object_id?: string;
      tracking_number?: string;
      tracking_url_provider?: string;
      label_url?: string;
      status?: string;
      messages?: { text?: string }[];
    };

    const resolved = await resolveShippoPurchaseLabel(tx);
    const txId = resolved.transactionId;
    const labelUrl = resolved.labelUrl;

    const labelNow = new Date();
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shippoShipmentId: sid,
        shippoTransactionId: txId,
        carrier: picked.provider ?? null,
        service: picked.servicelevel?.name ?? null,
        trackingNumber: resolved.trackingNumber,
        trackingUrl: resolved.trackingUrl,
        labelUrl,
        shippingStatus: resolved.shippingStatus ?? tx.status ?? "SUCCESS",
        fulfillmentStatus: "label_created",
        labelCreatedAt: labelNow,
        shippingLabelCostCents,
      },
    });

    const { chargeSellerForLabelCost, markOrderLabelCostReversalFailed } = await import(
      "@/services/shipping/charge-seller-label-cost"
    );
    const debit = await chargeSellerForLabelCost({
      orderId,
      labelCostCents: shippingLabelCostCents,
      shippoTransactionId: txId,
    });
    if (!debit.ok) {
      await markOrderLabelCostReversalFailed(orderId);
      console.error("[shipping] label cost debit failed after purchase", {
        orderId,
        code: debit.code,
        error: debit.error,
      });
    }

    const chargedCents =
      order.shippingChargedCents ?? Math.round(Math.max(0, order.shippingPriceUsd) * 100);
    console.info("[shipping economics]", {
      orderId,
      shippingChargedCents: chargedCents,
      shippingLabelCostCents,
      labelCostDebitOk: debit.ok,
    });
    const lt =
      order.listing.title.length > 80 ? `${order.listing.title.slice(0, 77)}...` : order.listing.title;
    const tn = resolved.trackingNumber ? ` Tracking: ${resolved.trackingNumber}.` : "";

    const { processLabelCreatedPayoutEvaluation } = await import(
      "@/services/payout/process-payout-tier-events"
    );
    void processLabelCreatedPayoutEvaluation(orderId);
    await logSellerCommerceEvent({
      sellerId: order.sellerId,
      listingId: order.listing.id,
      orderId: order.id,
      kind: SELLER_COMMERCE_KIND.fulfillmentLabelCreated,
      title: "Shipping label created",
      body: `A carrier label was purchased for "${lt}".${tn}`,
    });
    await createNotification(prisma, {
      userId: order.buyerId,
      type: "order_label_created",
      title: "Shipping label created",
      body: `Your order for "${lt}" has a carrier label.${tn}`,
      href: `/orders/${encodeURIComponent(orderId)}`,
    });
    scheduleOrderLifecycleEmail({
      userId: order.buyerId,
      kind: "order_label_created",
      orderId,
      listingTitle: order.listing.title,
      trackingNumber: resolved.trackingNumber,
    });
    await createNotification(prisma, {
      userId: order.sellerId,
      type: "seller_label_created",
      title: "Label ready",
      body: `Your label for "${lt}" is ready to print.${tn}`,
      href: `/orders/${encodeURIComponent(orderId)}`,
    });
    emitOrderLifecycleSync({
      orderId,
      parties: { sellerId: order.sellerId, buyerId: order.buyerId },
      listingId: order.listingId,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      extraPayload: { fulfillmentStatus: "label_created" },
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
      order.listing.title.length > 80 ? `${order.listing.title.slice(0, 77)}...` : order.listing.title;
    const errMsg = e instanceof Error ? e.message : String(e);
    await logSellerCommerceEvent({
      sellerId: order.sellerId,
      listingId: order.listing.id,
      orderId: order.id,
      kind: SELLER_COMMERCE_KIND.fulfillmentException,
      title: "Shipping exception",
      body: `Shippo could not create a label for "${lt}". ${errMsg.slice(0, 200)}`,
    });
    throw e instanceof Error ? e : new Error(errMsg);
  }
}

/** Map Shippo TRACK_UPDATED payloads to order fulfillmentStatus (best-effort). */
export function mapShippoTrackingToFulfillment(status: string | undefined): string | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s.includes("DELIVERED")) return "delivered";
  if (s.includes("OUT_FOR_DELIVERY") || s.includes("OUT FOR DELIVERY")) return "out_for_delivery";
  if (s.includes("PRE_TRANSIT") || s.includes("PRE TRANSIT")) return null;
  if (s.includes("TRANSIT") || s.includes("IN_TRANSIT") || s.includes("SHIPPED") || s.includes("PICKUP")) {
    return "in_transit";
  }
  if (s.includes("FAIL") || s.includes("EXCEPTION") || s.includes("ERROR")) return "exception";
  if (s.includes("UNKNOWN")) return null;
  return "in_transit";
}

export function buildOrderUpdateForShippoFulfillment(args: {
  mapped: string;
  carrierStatus: string | undefined;
  order: {
    status: string;
    shippedAt: Date | null;
    carrierAcceptedAt: Date | null;
  };
}): {
  fulfillmentStatus: string;
  shippingStatus?: string;
  status?: string;
  shippedAt?: Date;
  carrierAcceptedAt?: Date;
  deliveryConfirmedAt?: Date;
} {
  const now = new Date();
  const data: {
    fulfillmentStatus: string;
    shippingStatus?: string;
    status?: string;
    shippedAt?: Date;
    carrierAcceptedAt?: Date;
    deliveryConfirmedAt?: Date;
  } = {
    fulfillmentStatus: args.mapped,
  };
  if (args.carrierStatus) data.shippingStatus = args.carrierStatus;

  if (args.mapped === "in_transit" || args.mapped === "out_for_delivery") {
    if (args.order.status !== "delivered" && args.order.status !== "shipped") {
      data.status = "shipped";
      data.shippedAt = now;
    }
    if (args.mapped === "in_transit" && !args.order.carrierAcceptedAt) {
      data.carrierAcceptedAt = now;
    }
  } else if (args.mapped === "delivered") {
    data.status = "delivered";
    data.deliveryConfirmedAt = now;
  }

  return data;
}
