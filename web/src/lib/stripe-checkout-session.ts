import { getStripe } from "@/lib/stripe";

/** Reuse an open Checkout Session only when subtotal + tax mode match the order we are about to charge. */
export async function reuseOpenCheckoutSessionIfMatching(args: {
  sessionId: string | null | undefined;
  expectedSubtotalCents: number;
  taxEnabled: boolean;
}): Promise<string | null> {
  const sessionId = args.sessionId?.trim();
  if (!sessionId) return null;

  const stripe = getStripe();
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "open" || !session.url) return null;

    const subtotal = session.amount_subtotal ?? 0;
    const sessionTax = session.automatic_tax?.enabled === true;
    if (subtotal === args.expectedSubtotalCents && sessionTax === args.taxEnabled) {
      return session.url;
    }

    await stripe.checkout.sessions.expire(sessionId);
  } catch (e) {
    console.warn("[stripe-checkout-session] could not reuse checkout session", {
      sessionId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return null;
}

export function buyNowCheckoutSubtotalCents(order: {
  itemPriceUsd: number;
  shippingPriceUsd: number;
}): number {
  return Math.round(order.itemPriceUsd * 100) + Math.round(order.shippingPriceUsd * 100);
}
