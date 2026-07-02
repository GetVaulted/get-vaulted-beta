import { prisma } from "@/lib/prisma";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

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
      if (pi.status === "succeeded" && typeof pi.amount === "number" && pi.amount >= 50) {
        return Math.round(pi.amount) / 100;
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
    if (order?.totalUsd != null && Number.isFinite(order.totalUsd) && order.totalUsd > 0) {
      return order.totalUsd;
    }
    if (order) {
      const computed =
        (order.itemPriceUsd ?? 0) + (order.shippingPriceUsd ?? 0) + (order.taxUsd ?? 0);
      if (Number.isFinite(computed) && computed > 0) {
        return Math.round(computed * 100) / 100;
      }
    }
  }

  return args.fallbackUsd;
}
