import { getStripe } from "@/lib/stripe";

function sessionTaxCents(session: {
  total_details?: { amount_tax?: number | null } | null;
  metadata?: Record<string, string> | null;
}): number {
  const automaticTax = session.total_details?.amount_tax ?? 0;
  if (automaticTax > 0) return automaticTax;
  const fromMetadata = Number.parseInt(session.metadata?.salesTaxCents ?? "", 10);
  return Number.isFinite(fromMetadata) && fromMetadata > 0 ? fromMetadata : 0;
}

/** Reuse an open Checkout Session only when subtotal + tax match the order we are about to charge. */
export async function reuseOpenCheckoutSessionIfMatching(args: {
  sessionId: string | null | undefined;
  expectedSubtotalCents: number;
  expectedTaxCents: number;
  collectTax: boolean;
}): Promise<string | null> {
  const sessionId = args.sessionId?.trim();
  if (!sessionId) return null;

  const stripe = getStripe();
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "open" || !session.url) return null;

    const subtotal = session.amount_subtotal ?? 0;
    const actualTaxCents = sessionTaxCents(session);
    const sessionCollectTax =
      session.automatic_tax?.enabled === true || Boolean(session.metadata?.salesTaxCents);
    if (
      subtotal === args.expectedSubtotalCents &&
      sessionCollectTax === args.collectTax &&
      actualTaxCents === args.expectedTaxCents
    ) {
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
