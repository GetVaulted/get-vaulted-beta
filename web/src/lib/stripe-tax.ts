import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { ensureStripeCustomerIdForUser } from "@/lib/stripe-customer";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/** Tangible personal property (general merchandise). */
export const STRIPE_TAX_CODE_TANGIBLE = "txcd_99999999";
/** Shipping (when taxed separately). */
export const STRIPE_TAX_CODE_SHIPPING = "txcd_92010001";

export const TAX_PROVIDER_STRIPE = "stripe_tax";

export type ShipToAddress = {
  shipRecipientName: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
};

/** True when Stripe Tax is enabled via env and Stripe is configured. */
export function isStripeTaxFeatureEnabled(): boolean {
  if (!isStripeConfigured()) return false;
  const flag = process.env.STRIPE_TAX_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  // Default on when Stripe is configured — nexus per state still gates collection at checkout.
  return true;
}

export function normalizeCountryCode(country: string | null | undefined): string {
  const c = (country ?? "").trim().toUpperCase();
  if (!c || c === "USA" || c === "UNITED STATES") return "US";
  if (c.length === 2) return c;
  return c.slice(0, 2);
}

export function normalizeUsStateCode(state: string | null | undefined): string | null {
  const s = (state ?? "").trim().toUpperCase();
  if (!s) return null;
  return s.length === 2 ? s : s.slice(0, 2);
}

/** Whether Get Vaulted should collect sales tax for this ship-to (nexus gate). */
export async function isTaxCollectionEnabledForShipTo(
  state: string | null | undefined,
  country: string | null | undefined,
): Promise<boolean> {
  if (!isStripeTaxFeatureEnabled()) return false;
  if (normalizeCountryCode(country) !== "US") return false;
  const code = normalizeUsStateCode(state);
  if (!code) return false;
  const row = await prisma.taxNexusState.findUnique({
    where: { stateCode: code },
    select: { enabled: true },
  });
  return Boolean(row?.enabled);
}

/** Saved-card PaymentIntents skip Stripe Tax — use Checkout when nexus applies to ship-to. */
export async function orderRequiresCheckoutForTax(
  state: string | null | undefined,
  country: string | null | undefined,
): Promise<boolean> {
  return isTaxCollectionEnabledForShipTo(state, country);
}

export async function syncStripeCustomerShippingAddress(
  userId: string,
  ship: ShipToAddress,
): Promise<string> {
  const customerId = await ensureStripeCustomerIdForUser(userId);
  const stripe = getStripe();
  const address = {
    line1: ship.shipAddress.slice(0, 500),
    city: ship.shipCity.slice(0, 120),
    state: normalizeUsStateCode(ship.shipState) ?? ship.shipState.slice(0, 120),
    postal_code: ship.shipZip.slice(0, 32),
    country: normalizeCountryCode(ship.shipCountry),
  };
  await stripe.customers.update(customerId, {
    address,
    shipping: {
      name: ship.shipRecipientName.slice(0, 200),
      address,
    },
  });
  return customerId;
}

export type CheckoutTaxSessionFields = {
  automatic_tax?: { enabled: boolean; liability?: { type: "self" } };
  customer?: string;
  customer_update?: { shipping: "auto"; address: "auto" };
  shipping_address_collection?: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection;
};

function checkoutAutomaticTaxFields(): CheckoutTaxSessionFields["automatic_tax"] {
  return { enabled: true, liability: { type: "self" } };
}

/** Stripe Checkout tax params when nexus allows collection for the buyer ship-to address. */
export async function buildCheckoutTaxSessionFields(args: {
  buyerId: string;
  shipTo?: ShipToAddress | null;
  /** When true, collect shipping address on Checkout (break spots, etc.). */
  collectShippingAddress?: boolean;
}): Promise<CheckoutTaxSessionFields> {
  if (!isStripeTaxFeatureEnabled()) return {};

  if (args.shipTo) {
    const enabled = await isTaxCollectionEnabledForShipTo(args.shipTo.shipState, args.shipTo.shipCountry);
    if (!enabled) return {};
    const customerId = await syncStripeCustomerShippingAddress(args.buyerId, args.shipTo);
    return {
      automatic_tax: checkoutAutomaticTaxFields(),
      customer: customerId,
      customer_update: { shipping: "auto", address: "auto" },
    };
  }

  if (args.collectShippingAddress) {
    const anyEnabled = await prisma.taxNexusState.count({ where: { enabled: true } });
    if (anyEnabled === 0) return {};
    const customerId = await ensureStripeCustomerIdForUser(args.buyerId);
    return {
      automatic_tax: checkoutAutomaticTaxFields(),
      customer: customerId,
      customer_update: { shipping: "auto", address: "auto" },
      shipping_address_collection: { allowed_countries: ["US"] },
    };
  }

  return {};
}

export function stripeLineItemProductData(
  name: string,
  taxCode: string,
): Stripe.Checkout.SessionCreateParams.LineItem.PriceData.ProductData {
  return {
    name: name.slice(0, 120),
    tax_code: taxCode,
  };
}

export type ExtractedCheckoutTax = {
  taxAmountCents: number;
  taxUsd: number;
  stripeTaxCalculationId: string | null;
  totalAmountCents: number | null;
};

/** Read buyer-paid tax from a completed Checkout Session (platform fee / payout exclude this). */
export function extractTaxFromCheckoutSession(session: Stripe.Checkout.Session): ExtractedCheckoutTax {
  const taxAmountCents = session.total_details?.amount_tax ?? 0;
  const totalAmountCents = session.amount_total ?? null;
  const stripeTaxCalculationId =
    typeof (session as { tax_calculation?: string | null }).tax_calculation === "string"
      ? (session as { tax_calculation?: string }).tax_calculation ?? null
      : null;
  return {
    taxAmountCents,
    taxUsd: taxAmountCents / 100,
    stripeTaxCalculationId,
    totalAmountCents,
  };
}

/** Estimate sales tax via Stripe Tax Calculation API (no hardcoded rates). */
export async function estimateSalesTaxCents(args: {
  itemPriceUsd: number;
  shippingPriceUsd: number;
  shipTo: ShipToAddress;
}): Promise<{ taxAmountCents: number; taxCalculationId: string | null; collectTax: boolean }> {
  const enabled = await isTaxCollectionEnabledForShipTo(args.shipTo.shipState, args.shipTo.shipCountry);
  if (!enabled) {
    return { taxAmountCents: 0, taxCalculationId: null, collectTax: false };
  }

  const itemCents = Math.round(Math.max(0, args.itemPriceUsd) * 100);
  const shippingCents = Math.round(Math.max(0, args.shippingPriceUsd) * 100);
  if (itemCents + shippingCents <= 0) {
    return { taxAmountCents: 0, taxCalculationId: null, collectTax: true };
  }

  const stripe = getStripe();
  const lineItems: Stripe.Tax.CalculationCreateParams.LineItem[] = [];
  if (itemCents > 0) {
    lineItems.push({
      amount: itemCents,
      reference: "item",
      tax_code: STRIPE_TAX_CODE_TANGIBLE,
    });
  }
  if (shippingCents > 0) {
    lineItems.push({
      amount: shippingCents,
      reference: "shipping",
      tax_code: STRIPE_TAX_CODE_SHIPPING,
    });
  }

  const calculation = await stripe.tax.calculations.create({
    currency: "usd",
    line_items: lineItems,
    customer_details: {
      address: {
        line1: args.shipTo.shipAddress.slice(0, 500),
        city: args.shipTo.shipCity.slice(0, 120),
        state: normalizeUsStateCode(args.shipTo.shipState) ?? args.shipTo.shipState,
        postal_code: args.shipTo.shipZip.slice(0, 32),
        country: normalizeCountryCode(args.shipTo.shipCountry),
      },
      address_source: "shipping",
    },
  });

  return {
    taxAmountCents: calculation.tax_amount_exclusive ?? 0,
    taxCalculationId: calculation.id ?? null,
    collectTax: true,
  };
}

export async function fetchCheckoutSessionTax(checkoutSessionId: string): Promise<ExtractedCheckoutTax | null> {
  if (!checkoutSessionId.trim()) return null;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    return extractTaxFromCheckoutSession(session);
  } catch (e) {
    console.error("[stripe-tax] fetchCheckoutSessionTax", e);
    return null;
  }
}

export async function listTaxNexusStates() {
  return prisma.taxNexusState.findMany({ orderBy: { stateCode: "asc" } });
}

export async function setTaxNexusStateEnabled(stateCode: string, enabled: boolean, notes?: string | null) {
  const code = normalizeUsStateCode(stateCode);
  if (!code) throw new Error("INVALID_STATE");
  return prisma.taxNexusState.update({
    where: { stateCode: code },
    data: {
      enabled,
      notes: notes ?? undefined,
      registeredAt: enabled ? new Date() : null,
    },
  });
}
