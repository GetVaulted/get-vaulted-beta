import { prisma } from "@/lib/prisma";
import { roundUsd } from "@/lib/round-usd";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export type OrderChargeFields = {
  totalUsd: number;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
};

/** Settled charge on an order row (item + shipping + tax). */
export function orderChargeUsdFromFields(order: OrderChargeFields): number {
  const item = order.itemPriceUsd ?? 0;
  const ship = order.shippingPriceUsd ?? 0;
  const tax = order.taxUsd ?? 0;
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
      },
    });
    const charge = orderChargeFromLookup(order);
    if (charge != null) return charge;
  }

  return args.fallbackUsd;
}
