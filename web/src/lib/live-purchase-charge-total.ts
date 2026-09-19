import { prisma } from "@/lib/prisma";
import { roundUsd } from "@/lib/round-usd";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export type OrderChargeFields = {
  totalUsd: number;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  /** Prefer cents when present — some rows write taxAmountCents before taxUsd catches up. */
  taxAmountCents?: number | null;
};

/** Settled charge on an order row (item + shipping + tax). */
export function orderChargeUsdFromFields(order: OrderChargeFields): number {
  const item = order.itemPriceUsd ?? 0;
  const ship = order.shippingPriceUsd ?? 0;
  const taxFromCents =
    typeof order.taxAmountCents === "number" && Number.isFinite(order.taxAmountCents) && order.taxAmountCents > 0
      ? order.taxAmountCents / 100
      : 0;
  const tax = Math.max(order.taxUsd ?? 0, taxFromCents);
  const computed = item + ship + tax;
  const total = order.totalUsd ?? 0;
  // Some live fulfillment rows keep spot price in totalUsd until tax/shipping land.
  if (computed > 0 && computed > total + 0.001) return roundUsd(computed);
  if (total > 0) return roundUsd(total);
  if (computed > 0) return roundUsd(computed);
  return roundUsd(item);
}

export function resolveChargeUsdFromFulfillmentOrderMap(
  fallbackUsd: number,
  fulfillmentOrderId: string | null | undefined,
  orderChargeUsdById: ReadonlyMap<string, number>,
): number {
  const orderId = fulfillmentOrderId?.trim();
  if (orderId) {
    const charge = orderChargeUsdById.get(orderId);
    if (charge != null && Number.isFinite(charge) && charge > 0) return charge;
  }
  return roundUsd(fallbackUsd);
}

export async function loadOrderChargeTotalsById(orderIds: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return new Map();
  const orders = await prisma.order.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      totalUsd: true,
      itemPriceUsd: true,
      shippingPriceUsd: true,
      taxUsd: true,
      taxAmountCents: true,
    },
  });
  const map = new Map<string, number>();
  for (const order of orders) {
    map.set(order.id, orderChargeUsdFromFields(order));
  }
  return map;
}

function orderChargeFromLookup(order: {
  totalUsd: number;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  taxAmountCents?: number | null;
} | null): number | null {
  if (!order) return null;
  const charge = orderChargeUsdFromFields(order);
  return charge > 0 ? charge : null;
}

/** Buyer-facing charge total for live purchase notifications (spot + shipping + tax). */
export async function resolveLivePurchaseNotificationChargeUsd(args: {
  fallbackUsd: number;
  fulfillmentOrderId?: string | null;
  stripePaymentIntentId?: string | null;
}): Promise<number> {
  const piId = args.stripePaymentIntentId?.trim();
  if (piId && isStripeConfigured()) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(piId);
      if (typeof pi.amount === "number" && pi.amount >= 50) {
        if (pi.status === "succeeded" || pi.status === "processing") {
          return Math.round(pi.amount) / 100;
        }
      }
    } catch (e) {
      console.warn("[live purchase notify] payment intent amount lookup failed", { piId, e });
    }
  }

  const orderId = args.fulfillmentOrderId?.trim();
  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        totalUsd: true,
        itemPriceUsd: true,
        shippingPriceUsd: true,
        taxUsd: true,
        taxAmountCents: true,
      },
    });
    const charge = orderChargeFromLookup(order);
    if (charge != null) return charge;
  }

  return args.fallbackUsd;
}

/**
 * Host payment-failure + recent-sales parity: prefer the linked order's full charge
 * (item + shipping + tax), then variant/spot fulfillment order, else fallback.
 */
export async function resolveLivePaymentFailureChargeUsd(args: {
  fallbackUsd: number;
  orderId?: string | null;
  variantPurchaseId?: string | null;
  breakSpotId?: string | null;
}): Promise<number> {
  const directOrderId = args.orderId?.trim();
  if (directOrderId) {
    const map = await loadOrderChargeTotalsById([directOrderId]);
    const charge = map.get(directOrderId);
    if (charge != null && charge > 0) return charge;
  }

  const variantId = args.variantPurchaseId?.trim();
  if (variantId) {
    const purchase = await prisma.liveItemVariantPurchase.findUnique({
      where: { id: variantId },
      select: { totalUsd: true, fulfillmentOrderId: true },
    });
    if (purchase) {
      const map = await loadOrderChargeTotalsById(
        purchase.fulfillmentOrderId ? [purchase.fulfillmentOrderId] : [],
      );
      return resolveChargeUsdFromFulfillmentOrderMap(
        purchase.totalUsd > 0 ? purchase.totalUsd : args.fallbackUsd,
        purchase.fulfillmentOrderId,
        map,
      );
    }
  }

  const spotId = args.breakSpotId?.trim();
  if (spotId) {
    const spot = await prisma.breakSpot.findUnique({
      where: { id: spotId },
      select: { priceUsd: true, fulfillmentOrderId: true },
    });
    if (spot) {
      const map = await loadOrderChargeTotalsById(
        spot.fulfillmentOrderId ? [spot.fulfillmentOrderId] : [],
      );
      return resolveChargeUsdFromFulfillmentOrderMap(
        spot.priceUsd > 0 ? spot.priceUsd : args.fallbackUsd,
        spot.fulfillmentOrderId,
        map,
      );
    }
  }

  return roundUsd(args.fallbackUsd);
}

/** Batch-enrich failure rows so Sales sheet amounts match Recent sales. */
export async function enrichPaymentFailureChargeAmounts<
  T extends {
    amountUsd: number;
    orderId?: string | null;
    variantPurchaseId?: string | null;
    breakSpotId?: string | null;
  },
>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;

  const orderIds = new Set<string>();
  const variantIds: string[] = [];
  const spotIds: string[] = [];
  for (const row of rows) {
    const oid = row.orderId?.trim();
    if (oid) orderIds.add(oid);
    const vid = row.variantPurchaseId?.trim();
    if (vid) variantIds.push(vid);
    const sid = row.breakSpotId?.trim();
    if (sid) spotIds.push(sid);
  }

  const [variants, spots] = await Promise.all([
    variantIds.length
      ? prisma.liveItemVariantPurchase.findMany({
          where: { id: { in: [...new Set(variantIds)] } },
          select: { id: true, totalUsd: true, fulfillmentOrderId: true },
        })
      : Promise.resolve([] as { id: string; totalUsd: number; fulfillmentOrderId: string | null }[]),
    spotIds.length
      ? prisma.breakSpot.findMany({
          where: { id: { in: [...new Set(spotIds)] } },
          select: { id: true, priceUsd: true, fulfillmentOrderId: true },
        })
      : Promise.resolve([] as { id: string; priceUsd: number; fulfillmentOrderId: string | null }[]),
  ]);

  const variantById = new Map(variants.map((v) => [v.id, v]));
  const spotById = new Map(spots.map((s) => [s.id, s]));
  for (const v of variants) {
    const fid = v.fulfillmentOrderId?.trim();
    if (fid) orderIds.add(fid);
  }
  for (const s of spots) {
    const fid = s.fulfillmentOrderId?.trim();
    if (fid) orderIds.add(fid);
  }

  const chargeByOrderId = await loadOrderChargeTotalsById([...orderIds]);

  return rows.map((row) => {
    const oid = row.orderId?.trim();
    if (oid) {
      const charge = chargeByOrderId.get(oid);
      if (charge != null && charge > 0) return { ...row, amountUsd: charge };
    }
    const vid = row.variantPurchaseId?.trim();
    if (vid) {
      const purchase = variantById.get(vid);
      if (purchase) {
        return {
          ...row,
          amountUsd: resolveChargeUsdFromFulfillmentOrderMap(
            purchase.totalUsd > 0 ? purchase.totalUsd : row.amountUsd,
            purchase.fulfillmentOrderId,
            chargeByOrderId,
          ),
        };
      }
    }
    const sid = row.breakSpotId?.trim();
    if (sid) {
      const spot = spotById.get(sid);
      if (spot) {
        return {
          ...row,
          amountUsd: resolveChargeUsdFromFulfillmentOrderMap(
            spot.priceUsd > 0 ? spot.priceUsd : row.amountUsd,
            spot.fulfillmentOrderId,
            chargeByOrderId,
          ),
        };
      }
    }
    return row;
  });
}
