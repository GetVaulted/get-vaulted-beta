import { prisma } from "@/lib/prisma";
import {
  fallbackChargeBreakdownFromListing,
  fetchCheckoutSessionChargeBreakdown,
  orderChargeBreakdownNeedsRepair,
  type CheckoutChargeBreakdown,
  type OrderChargeFields,
} from "@/lib/stripe-checkout-breakdown";

export type EnrichableSellerOrder = OrderChargeFields & { id: string };

async function resolveBreakdown(order: EnrichableSellerOrder): Promise<CheckoutChargeBreakdown | null> {
  const sessionId = order.stripeCheckoutSessionId?.trim();
  if (sessionId) {
    const fromStripe = await fetchCheckoutSessionChargeBreakdown(sessionId);
    if (fromStripe) return fromStripe;
  }
  return fallbackChargeBreakdownFromListing(order);
}

/** Repair item/shipping/tax split from Stripe Checkout (persists when changed). */
export async function enrichSellerOrderChargeBreakdown<T extends EnrichableSellerOrder>(
  order: T,
): Promise<T> {
  if (!orderChargeBreakdownNeedsRepair(order)) return order;

  const breakdown = await resolveBreakdown(order);
  if (!breakdown) return order;

  const taxAmountCents = Math.round(breakdown.taxUsd * 100);
  const shippingChargedCents = Math.round(breakdown.shippingPriceUsd * 100);

  const changed =
    Math.abs(order.itemPriceUsd - breakdown.itemPriceUsd) > 0.009 ||
    Math.abs(order.shippingPriceUsd - breakdown.shippingPriceUsd) > 0.009 ||
    Math.abs(Math.max(order.taxUsd, order.taxAmountCents / 100) - breakdown.taxUsd) > 0.009 ||
    Math.abs(order.totalUsd - breakdown.totalUsd) > 0.009;

  if (changed) {
    await prisma.order
      .update({
        where: { id: order.id },
        data: {
          itemPriceUsd: breakdown.itemPriceUsd,
          shippingPriceUsd: breakdown.shippingPriceUsd,
          taxUsd: breakdown.taxUsd,
          taxAmountCents,
          totalUsd: breakdown.totalUsd,
          shippingChargedCents,
        },
      })
      .catch((e) => console.warn("[enrichSellerOrderChargeBreakdown] persist failed", order.id, e));
  }

  return {
    ...order,
    itemPriceUsd: breakdown.itemPriceUsd,
    shippingPriceUsd: breakdown.shippingPriceUsd,
    taxUsd: breakdown.taxUsd,
    taxAmountCents,
    totalUsd: breakdown.totalUsd,
    shippingChargedCents,
  };
}
