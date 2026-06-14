import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  extractTaxFromCheckoutSession,
  STRIPE_TAX_CODE_SHIPPING,
  STRIPE_TAX_CODE_TANGIBLE,
} from "@/lib/stripe-tax";

export type CheckoutChargeBreakdown = {
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  totalUsd: number;
};

function centsToUsd(cents: number): number {
  return Math.round(Math.max(0, cents)) / 100;
}

function lineTaxCode(line: Stripe.LineItem): string | null {
  const price = line.price;
  if (!price || typeof price.product !== "object" || !price.product) return null;
  const product = price.product as Stripe.Product;
  return typeof product.tax_code === "string" ? product.tax_code : null;
}

function lineName(line: Stripe.LineItem): string {
  return (line.description ?? "").trim().toLowerCase();
}

/** Parse Stripe Checkout line items into item / shipping / tax (buyer charge). */
export function extractCheckoutChargeBreakdownFromSession(
  session: Stripe.Checkout.Session,
  lineItems: Stripe.LineItem[],
): CheckoutChargeBreakdown {
  const taxFromSession = extractTaxFromCheckoutSession(session);
  let itemCents = 0;
  let shippingCents = 0;
  let explicitTaxCents = 0;

  for (const line of lineItems) {
    const cents = line.amount_total ?? 0;
    if (cents <= 0) continue;
    const name = lineName(line);
    const taxCode = lineTaxCode(line);

    if (name === "sales tax" || name.endsWith(" sales tax")) {
      explicitTaxCents += cents;
      continue;
    }
    if (taxCode === STRIPE_TAX_CODE_SHIPPING || name.includes("shipping")) {
      shippingCents += cents;
      continue;
    }
    if (taxCode === STRIPE_TAX_CODE_TANGIBLE) {
      itemCents += cents;
      continue;
    }
    // Unknown line — treat first non-tax/shipping bucket as item, else shipping.
    if (itemCents === 0) itemCents += cents;
    else shippingCents += cents;
  }

  const taxCents = Math.max(explicitTaxCents, taxFromSession.taxAmountCents);
  const totalCents =
    session.amount_total ??
    itemCents + shippingCents + taxCents;

  // Reconcile item when line items omit tax line but total_details has tax.
  if (itemCents + shippingCents + taxCents !== totalCents && totalCents > 0) {
    const derivedItem = totalCents - shippingCents - taxCents;
    if (derivedItem > 0 && derivedItem < itemCents + shippingCents + taxCents + 1) {
      itemCents = derivedItem;
    }
  }

  return {
    itemPriceUsd: centsToUsd(itemCents),
    shippingPriceUsd: centsToUsd(shippingCents),
    taxUsd: centsToUsd(taxCents),
    totalUsd: centsToUsd(totalCents),
  };
}

export async function fetchCheckoutSessionChargeBreakdown(
  checkoutSessionId: string,
): Promise<CheckoutChargeBreakdown | null> {
  const id = checkoutSessionId.trim();
  if (!id) return null;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(id, {
      expand: ["line_items.data.price.product"],
    });
    const lineItems: Stripe.LineItem[] = [];
    if (session.line_items?.data?.length) {
      lineItems.push(...session.line_items.data);
    } else {
      let startingAfter: string | undefined;
      for (;;) {
        const page = await stripe.checkout.sessions.listLineItems(id, {
          limit: 100,
          expand: ["data.price.product"],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        lineItems.push(...page.data);
        if (!page.has_more || page.data.length === 0) break;
        startingAfter = page.data[page.data.length - 1]?.id;
      }
    }
    if (!lineItems.length && !session.amount_total) return null;
    return extractCheckoutChargeBreakdownFromSession(session, lineItems);
  } catch (e) {
    console.error("[stripe-checkout-breakdown] fetch failed", e);
    return null;
  }
}

export type OrderChargeFields = {
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  taxAmountCents: number;
  totalUsd: number;
  shippingChargedCents: number | null;
  stripeCheckoutSessionId: string | null;
  listing?: { priceUsd: number } | null;
};

export function orderChargeBreakdownNeedsRepair(order: OrderChargeFields): boolean {
  const taxUsd = Math.max(order.taxUsd ?? 0, (order.taxAmountCents ?? 0) / 100);
  let shippingUsd = Math.max(0, order.shippingPriceUsd ?? 0);
  if (shippingUsd <= 0 && order.shippingChargedCents != null && order.shippingChargedCents > 0) {
    shippingUsd = order.shippingChargedCents / 100;
  }
  const itemUsd = Math.max(0, order.itemPriceUsd ?? 0);
  const totalUsd = Math.max(0, order.totalUsd ?? 0);
  if (totalUsd <= 0) return false;

  const sum = Math.round((itemUsd + shippingUsd + taxUsd) * 100) / 100;
  if (Math.abs(sum - totalUsd) > 0.02) return true;
  if (shippingUsd <= 0 && taxUsd <= 0 && itemUsd >= totalUsd * 0.99) return true;
  return false;
}

export function fallbackChargeBreakdownFromListing(order: OrderChargeFields): CheckoutChargeBreakdown | null {
  const totalUsd = Math.max(0, order.totalUsd ?? 0);
  const listingPrice = order.listing?.priceUsd;
  if (!listingPrice || listingPrice <= 0 || totalUsd <= 0) return null;
  if (order.itemPriceUsd <= listingPrice + 0.02) return null;

  const taxUsd = Math.max(order.taxUsd ?? 0, (order.taxAmountCents ?? 0) / 100);
  const itemPriceUsd = listingPrice;
  const remainder = Math.max(0, Math.round((totalUsd - itemPriceUsd - taxUsd) * 100) / 100);
  const shippingPriceUsd =
    order.shippingPriceUsd > 0
      ? order.shippingPriceUsd
      : order.shippingChargedCents != null && order.shippingChargedCents > 0
        ? order.shippingChargedCents / 100
        : remainder;

  if (itemPriceUsd + shippingPriceUsd + taxUsd > totalUsd + 0.02) return null;
  return { itemPriceUsd, shippingPriceUsd, taxUsd, totalUsd };
}
