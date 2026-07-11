import type { PrismaClient } from "@/generated/prisma/client";
import type {
  SellerLiveShippingDashboard,
  SellerLiveShippingLabelStatus,
  SellerLiveShippingSessionRow,
} from "@/lib/seller-live-shipping-dashboard-types";
import { orderHasUsableShippingLabel } from "@/lib/seller-shipping-label-state";
import { prisma } from "@/lib/prisma";
import { PAYMENT_PAID } from "@/services/payments";

export type {
  SellerLiveShippingDashboard,
  SellerLiveShippingLabelStatus,
  SellerLiveShippingOrderRow,
  SellerLiveShippingSessionRow,
} from "@/lib/seller-live-shipping-dashboard-types";

function orderHasLabel(o: {
  shippoTransactionId: string | null;
  labelUrl: string | null;
  fulfillmentStatus?: string | null;
}): boolean {
  return orderHasUsableShippingLabel(o);
}

function orderChargedCents(o: {
  shippingChargedCents: number | null;
  shippingPriceUsd: number;
  paymentStatus: string;
}): number {
  if (o.shippingChargedCents != null && Number.isFinite(o.shippingChargedCents)) {
    return Math.max(0, Math.floor(o.shippingChargedCents));
  }
  if (o.paymentStatus === PAYMENT_PAID) {
    return Math.max(0, Math.round(Math.max(0, o.shippingPriceUsd) * 100));
  }
  return 0;
}

function labelStatusForSession(
  orders: {
    paymentStatus: string;
    shippoTransactionId: string | null;
    labelUrl: string | null;
    fulfillmentStatus?: string | null;
  }[],
): SellerLiveShippingLabelStatus {
  if (orders.length === 0) return "empty";
  const paid = orders.filter((o) => o.paymentStatus === PAYMENT_PAID);
  if (paid.length === 0) return "awaiting_payment";
  const labeled = paid.filter(orderHasLabel);
  if (labeled.length === paid.length) return "complete";
  if (labeled.length > 0) return "partial";
  return "labels_needed";
}

type Db = Pick<PrismaClient, "liveShippingSession">;

export async function getSellerLiveShippingDashboard(sellerId: string, db: Db = prisma): Promise<SellerLiveShippingDashboard> {
  const sessions = await db.liveShippingSession.findMany({
    where: { sellerId },
    orderBy: { updatedAt: "desc" },
    include: {
      buyer: { select: { id: true, username: true, name: true } },
      liveShow: { select: { id: true, title: true, status: true } },
      _count: { select: { items: true } },
      orders: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          itemPriceUsd: true,
          shippingPriceUsd: true,
          shippingChargedCents: true,
          shippingLabelCostCents: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          trackingNumber: true,
          trackingUrl: true,
          carrier: true,
          service: true,
          shippoShipmentId: true,
          shippoTransactionId: true,
          labelUrl: true,
          shippingStatus: true,
          listing: { select: { title: true, shipAlone: true } },
        },
      },
    },
  });

  const sessionRows: SellerLiveShippingSessionRow[] = [];
  let totalCharged = 0;
  let totalLabel = 0;

  for (const s of sessions) {
    const dest = s.destinationAddressId ?? null;
    const bundled = !dest || !dest.startsWith("ship-alone:");

    // Combined bundle already labeled: stamp paid non-ship-alone siblings that missed the update
    // so the UI does not offer duplicate per-order labels for the same package.
    if (bundled) {
      const donor = s.orders.find((o) => orderHasLabel(o) && !o.listing.shipAlone);
      if (donor) {
        const orphans = s.orders.filter(
          (o) => o.paymentStatus === PAYMENT_PAID && !orderHasLabel(o) && !o.listing.shipAlone,
        );
        if (orphans.length > 0) {
          await prisma.order.updateMany({
            where: { id: { in: orphans.map((o) => o.id) } },
            data: {
              shippoShipmentId: donor.shippoShipmentId,
              shippoTransactionId: donor.shippoTransactionId,
              carrier: donor.carrier,
              service: donor.service,
              trackingNumber: donor.trackingNumber,
              trackingUrl: donor.trackingUrl,
              labelUrl: donor.labelUrl,
              shippingStatus: donor.shippingStatus ?? (donor.labelUrl ? "SUCCESS" : null),
              fulfillmentStatus: donor.labelUrl ? "label_created" : donor.fulfillmentStatus,
              shippingLabelCostCents: 0,
            },
          });
          for (const o of orphans) {
            o.shippoShipmentId = donor.shippoShipmentId;
            o.shippoTransactionId = donor.shippoTransactionId;
            o.carrier = donor.carrier;
            o.service = donor.service;
            o.trackingNumber = donor.trackingNumber;
            o.trackingUrl = donor.trackingUrl;
            o.labelUrl = donor.labelUrl;
            o.shippingStatus = donor.shippingStatus ?? (donor.labelUrl ? "SUCCESS" : null);
            o.fulfillmentStatus = donor.labelUrl ? "label_created" : donor.fulfillmentStatus;
            o.shippingLabelCostCents = 0;
          }
        }
      }
    }

    const orders = s.orders;
    const shippingChargedCents = orders.reduce((sum, o) => sum + orderChargedCents(o), 0);
    const shippingLabelCostCents = orders.reduce((sum, o) => {
      const c = o.shippingLabelCostCents;
      if (c == null || !Number.isFinite(c)) return sum;
      return sum + Math.max(0, Math.floor(c));
    }, 0);
    const marginCents = shippingChargedCents - shippingLabelCostCents;
    const marginNegative = marginCents < 0;
    const labelStatus = labelStatusForSession(orders);
    const ordersNeedingLabels = orders
      .filter((o) => o.paymentStatus === PAYMENT_PAID && !orderHasLabel(o))
      .map((o) => o.id);

    totalCharged += shippingChargedCents;
    totalLabel += shippingLabelCostCents;

    const anyLabelInSession = orders.some(orderHasLabel);
    const hasEligibleBundledTarget = orders.some(
      (o) => o.paymentStatus === PAYMENT_PAID && !orderHasLabel(o) && !o.listing.shipAlone,
    );
    const canCreateBundledLabel = bundled && !anyLabelInSession && hasEligibleBundledTarget;
    const firstLabeled = orders.find(orderHasLabel);
    const bundledLabel = firstLabeled
      ? {
          labelUrl: firstLabeled.labelUrl,
          trackingNumber: firstLabeled.trackingNumber,
          shippoTransactionId: firstLabeled.shippoTransactionId,
        }
      : null;

    sessionRows.push({
      sessionId: s.id,
      liveShowId: s.liveShowId,
      liveShowTitle: s.liveShow.title,
      liveShowStatus: s.liveShow.status,
      buyer: {
        id: s.buyer.id,
        username: s.buyer.username,
        name: s.buyer.name,
      },
      destinationAddressId: dest,
      bundled,
      itemCount: s._count.items,
      orderCount: orders.length,
      pricingWeightOz: s.pricingWeightOz,
      sessionShippingCents: s.shippingCostCents,
      shippingChargedCents,
      shippingLabelCostCents,
      marginCents,
      marginNegative,
      capReached: s.capReached,
      labelStatus,
      ordersNeedingLabels,
      canCreateBundledLabel,
      bundledLabel,
      orders: orders.map((o) => ({
        id: o.id,
        listingTitle: o.listing.title,
        itemPriceUsd: o.itemPriceUsd,
        shipAlone: o.listing.shipAlone,
        shippingChargedPortionCents:
          o.shippingChargedCents != null && Number.isFinite(o.shippingChargedCents)
            ? o.shippingChargedCents
            : o.paymentStatus === PAYMENT_PAID
              ? Math.round(Math.max(0, o.shippingPriceUsd) * 100)
              : null,
        orderStatus: o.status,
        paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        trackingNumber: o.trackingNumber,
        hasLabel: orderHasLabel(o),
        shippingLabelCostCents: o.shippingLabelCostCents,
      })),
    });
  }

  const marginCents = totalCharged - totalLabel;

  return {
    totals: {
      shippingChargedCents: totalCharged,
      shippingLabelCostCents: totalLabel,
      marginCents,
      marginNegative: marginCents < 0,
    },
    sessions: sessionRows,
  };
}
