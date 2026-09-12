import type { PrismaClient } from "@/generated/prisma/client";
import type {
  SellerLiveShippingDashboard,
  SellerLiveShippingLabelStatus,
  SellerLiveShippingSessionRow,
} from "@/lib/seller-live-shipping-dashboard-types";
import { resolveSellerShippingBreakdown } from "@/lib/seller-shipping-breakdown";
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
          shippingLabelCostReversedCents: true,
          labelCreatedAt: true,
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
          labelFinances: {
            select: {
              id: true,
              orderId: true,
              shippoTransactionId: true,
              shippoShipmentId: true,
              labelCostCents: true,
              purpose: true,
              replacesShippoTransactionId: true,
              status: true,
              sellerClawbackCents: true,
              sellerClawbackReversalId: true,
              sellerCreditCents: true,
              sellerCreditTransferId: true,
              clawbackIdempotencyKey: true,
              creditIdempotencyKey: true,
            },
          },
          listing: { select: { title: true, shipAlone: true } },
        },
      },
    },
  });

  const sessionRows: SellerLiveShippingSessionRow[] = [];
  let totalCharged = 0;
  let totalLabel = 0;
  let totalPendingLabels = 0;
  let totalFailedLabels = 0;

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
    const orderBreakdowns = orders.map((o) =>
      resolveSellerShippingBreakdown({
        shippingChargedCents: o.shippingChargedCents,
        shippingPriceUsd: o.shippingPriceUsd,
        shippingLabelCostCents: o.shippingLabelCostCents,
        shippingLabelCostReversedCents: o.shippingLabelCostReversedCents,
        carrier: o.carrier,
        service: o.service,
        trackingNumber: o.trackingNumber,
        labelCreatedAt: o.labelCreatedAt,
        labelUrl: o.labelUrl,
        shippoTransactionId: o.shippoTransactionId,
        labelFinances: o.labelFinances,
      }),
    );
    const shippingChargedCents = orderBreakdowns.reduce((sum, b) => sum + b.buyerShippingCollectedCents, 0);
    const shippingLabelCostCents = orderBreakdowns.reduce(
      (sum, b) => sum + (b.actualLabelCostCents ?? 0),
      0,
    );
    const pendingLabelCount = orderBreakdowns.filter(
      (b) => b.labelStatus === "pending" || b.labelStatus === "quoted",
    ).length;
    const failedLabelCount = orderBreakdowns.filter((b) => b.labelStatus === "failed").length;
    const netShippingImpactCents = orderBreakdowns.reduce((sum, b) => sum + b.netShippingImpactCents, 0);
    const marginCents = netShippingImpactCents;
    const marginNegative = marginCents < 0;
    const labelStatus = labelStatusForSession(orders);
    const ordersNeedingLabels = orders
      .filter((o) => o.paymentStatus === PAYMENT_PAID && !orderHasLabel(o))
      .map((o) => o.id);

    totalCharged += shippingChargedCents;
    totalLabel += shippingLabelCostCents;
    totalPendingLabels += pendingLabelCount;
    totalFailedLabels += failedLabelCount;

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
      netShippingImpactCents,
      pendingLabelCount,
      failedLabelCount,
      marginCents,
      marginNegative,
      capReached: s.capReached,
      labelStatus,
      ordersNeedingLabels,
      canCreateBundledLabel,
      bundledLabel,
      orders: orders.map((o, idx) => {
        const b = orderBreakdowns[idx]!;
        return {
          id: o.id,
          listingTitle: o.listing.title,
          itemPriceUsd: o.itemPriceUsd,
          shipAlone: o.listing.shipAlone,
          shippingChargedPortionCents: b.buyerShippingCollectedCents,
          actualLabelCostCents: b.actualLabelCostCents,
          labelStatus: b.labelStatus,
          netShippingImpactCents: b.netShippingImpactCents,
          orderStatus: o.status,
          paymentStatus: o.paymentStatus,
          fulfillmentStatus: o.fulfillmentStatus,
          trackingNumber: o.trackingNumber,
          hasLabel: orderHasLabel(o),
          shippingLabelCostCents: o.shippingLabelCostCents,
        };
      }),
    });
  }

  const marginCents = totalCharged - totalLabel;

  return {
    totals: {
      shippingChargedCents: totalCharged,
      shippingLabelCostCents: totalLabel,
      netShippingImpactCents: marginCents,
      pendingLabelCount: totalPendingLabels,
      failedLabelCount: totalFailedLabels,
      marginCents,
      marginNegative: marginCents < 0,
    },
    sessions: sessionRows,
  };
}
