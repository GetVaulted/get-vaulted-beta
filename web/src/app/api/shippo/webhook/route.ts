import { NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { verifyShippoWebhookSignature } from "@/lib/shippo";
import { SELLER_COMMERCE_KIND, logSellerCommerceEvent } from "@/lib/seller-commerce-event";
import { mapShippoTrackingToFulfillment } from "@/services/shipping";
import { processDeliveryPayoutEvaluation } from "@/services/payout/process-delivery-payout";
import { processCarrierAcceptancePayoutEvaluation } from "@/services/payout/process-payout-tier-events";
import {
  createWebhookLogEntry,
  markWebhookLogFailure,
  markWebhookLogSuccess,
  updateWebhookLogEntry,
} from "@/services/webhook-log";

export const runtime = "nodejs";

type TrackPayload = {
  event?: string;
  test?: boolean;
  data?: {
    tracking_number?: string;
    tracking_status?: { status?: string };
    transaction?: string;
  };
};

/**
 * Shippo tracking / transaction webhooks.
 * Logged to `WebhookEventLog`; handler errors return 500 where appropriate.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const { id: logId } = await createWebhookLogEntry({
    source: "shippo",
    eventType: "received",
    payload: raw,
  });

  const sig =
    req.headers.get("Shippo-Signature") ??
    req.headers.get("X-Shippo-Signature") ??
    req.headers.get("x-shippo-signature");

  if (process.env.SHIPPO_WEBHOOK_SECRET && !verifyShippoWebhookSignature(raw, sig)) {
    await markWebhookLogFailure(logId, "verify: invalid_signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: TrackPayload;
  try {
    body = JSON.parse(raw) as TrackPayload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markWebhookLogFailure(logId, `parse: ${msg}`);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventName = typeof body.event === "string" ? body.event : "unknown";
  await updateWebhookLogEntry(logId, { eventType: eventName });

  try {
    if (eventName !== "track_updated" && eventName !== "transaction_updated") {
      await markWebhookLogSuccess(logId);
      return NextResponse.json({ ok: true, ignored: eventName });
    }

    const data = body.data;
    const trackingNumber = typeof data?.tracking_number === "string" ? data.tracking_number : null;
    const txnId = typeof data?.transaction === "string" ? data.transaction : null;
    const carrierStatus = data?.tracking_status?.status;

    const mapped = mapShippoTrackingToFulfillment(carrierStatus);
    if (!mapped) {
      await markWebhookLogSuccess(logId);
      return NextResponse.json({ ok: true });
    }

    const orFilters: { shippoTransactionId?: string; trackingNumber?: string }[] = [];
    if (txnId) orFilters.push({ shippoTransactionId: txnId });
    if (trackingNumber) orFilters.push({ trackingNumber });
    if (orFilters.length === 0) {
      await markWebhookLogSuccess(logId);
      return NextResponse.json({ ok: true, note: "no_tracking_or_transaction" });
    }

    const orders = await prisma.order.findMany({
      where: {
        OR: orFilters,
        paymentStatus: "paid",
      },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        listingId: true,
        fulfillmentStatus: true,
        listing: { select: { title: true } },
      },
    });
    const seen = new Set<string>();
    for (const o of orders) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const prev = o.fulfillmentStatus;
      await prisma.order.update({
        where: { id: o.id },
        data: {
          fulfillmentStatus: mapped,
          shippingStatus: carrierStatus ?? undefined,
        },
      });
      const lt =
        o.listing.title.length > 70 ? `${o.listing.title.slice(0, 67)}…` : o.listing.title;
      if (mapped === "delivered" && prev !== "delivered") {
        await logSellerCommerceEvent({
          sellerId: o.sellerId,
          listingId: o.listingId,
          orderId: o.id,
          kind: SELLER_COMMERCE_KIND.fulfillmentDelivered,
          title: "Delivered",
          body: `Carrier reports delivered for “${lt}”.`,
        });
        await createNotification(prisma, {
          userId: o.buyerId,
          type: "order_delivered",
          title: "Delivered",
          body: `“${lt}” was marked delivered by the carrier.`,
          href: `/orders/${encodeURIComponent(o.id)}`,
        });
        await createNotification(prisma, {
          userId: o.sellerId,
          type: "seller_order_delivered",
          title: "Order delivered",
          body: `Carrier reports “${lt}” reached the buyer.`,
          href: `/orders/${encodeURIComponent(o.id)}`,
        });
        void processDeliveryPayoutEvaluation(o.id);
      } else if (mapped === "in_transit" && prev !== "in_transit" && prev !== "delivered") {
        void processCarrierAcceptancePayoutEvaluation(o.id);
        await logSellerCommerceEvent({
          sellerId: o.sellerId,
          listingId: o.listingId,
          orderId: o.id,
          kind: SELLER_COMMERCE_KIND.fulfillmentInTransit,
          title: "Shipment in transit",
          body: `Carrier status update for “${lt}”: in transit.`,
        });
        await createNotification(prisma, {
          userId: o.buyerId,
          type: "order_in_transit",
          title: "Package in transit",
          body: `“${lt}” is on the way.`,
          href: `/orders/${encodeURIComponent(o.id)}`,
        });
      } else if (mapped === "exception" && prev !== "exception") {
        await logSellerCommerceEvent({
          sellerId: o.sellerId,
          listingId: o.listingId,
          orderId: o.id,
          kind: SELLER_COMMERCE_KIND.fulfillmentException,
          title: "Shipping exception",
          body: `Carrier reported an issue for “${lt}”. Check Shippo or the carrier for details.`,
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[shippo webhook] process", e);
    await markWebhookLogFailure(logId, `process: ${msg}`);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  await markWebhookLogSuccess(logId);
  return NextResponse.json({ ok: true });
}
