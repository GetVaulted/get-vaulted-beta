import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { ensureStripeCustomerIdForUser } from "@/lib/stripe-customer";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { normalizeUsStateCode } from "@/lib/us-state-code";

export { normalizeUsStateCode } from "@/lib/us-state-code";

/** Tangible personal property (general merchandise). */
export const STRIPE_TAX_CODE_TANGIBLE = "txcd_99999999";
/** Shipping (when taxed separately). */
export const STRIPE_TAX_CODE_SHIPPING = "txcd_92010001";

export const TAX_PROVIDER_STRIPE = "stripe_tax";

export type ShipFromAddress = {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

function normalizeShipFromAddress(shipFrom: ShipFromAddress): ShipFromAddress | null {
  const state = normalizeUsStateCode(shipFrom.state) ?? shipFrom.state.trim();
  const country = normalizeCountryCode(shipFrom.country);
  const postalCode = shipFrom.postalCode.trim();
  if (!state || !postalCode || country !== "US") return null;
  return {
    line1: shipFrom.line1.trim(),
    city: shipFrom.city.trim(),
    state,
    postalCode,
    country,
  };
}

/** Conservative TX combined rate when Stripe Tax returns zero for an eligible TX sale. */
const TEXAS_FALLBACK_SALES_TAX_RATE = 0.0825;

function sumTaxBreakdownCents(calculation: Stripe.Tax.Calculation): number {
  const breakdown = calculation.tax_breakdown ?? [];
  const fromBreakdown = breakdown.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  if (fromBreakdown > 0) return fromBreakdown;
  const shippingTax = calculation.shipping_cost?.amount_tax ?? 0;
  return (calculation.tax_amount_exclusive ?? 0) + shippingTax;
}

function texasFallbackTaxCents(itemCents: number, shippingCents: number): number {
  const base = itemCents + shippingCents;
  if (base <= 0) return 0;
  return Math.round(base * TEXAS_FALLBACK_SALES_TAX_RATE);
}

export async function loadSellerShipFromForTax(sellerId: string): Promise<ShipFromAddress | null> {
  const user = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      shipFromStreet: true,
      shipFromCity: true,
      shipFromState: true,
      shipFromZip: true,
      shipFromCountry: true,
    },
  });
  if (!user?.shipFromState?.trim() || !user.shipFromZip?.trim()) return null;
  return normalizeShipFromAddress({
    line1: user.shipFromStreet?.trim() || "Ship from",
    city: user.shipFromCity?.trim() || "",
    state: user.shipFromState,
    postalCode: user.shipFromZip,
    country: user.shipFromCountry ?? "US",
  });
}

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
  if (!c || c === "USA" || c === "UNITED STATES" || c.startsWith("UNITED")) return "US";
  // Legacy bug: address create truncated "United States" to "Un".
  if (c === "UN") return "US";
  if (c.length === 2) return c;
  return c.slice(0, 2);
}

export function normalizeShipToAddress(ship: ShipToAddress): ShipToAddress {
  const state = normalizeUsStateCode(ship.shipState) ?? ship.shipState.trim();
  return {
    ...ship,
    shipState: state,
    shipCountry: normalizeCountryCode(ship.shipCountry),
  };
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

/** Marketplace sales tax: nexus ship-to plus TX intrastate seller requirement when ship-from is known. */
export async function isMarketplaceSaleTaxEligible(args: {
  shipTo: ShipToAddress;
  sellerShipFrom?: ShipFromAddress | null;
}): Promise<boolean> {
  const shipTo = normalizeShipToAddress(args.shipTo);
  const enabled = await isTaxCollectionEnabledForShipTo(shipTo.shipState, shipTo.shipCountry);
  if (!enabled) return false;

  const buyerState = normalizeUsStateCode(shipTo.shipState);
  if (buyerState !== "TX") return true;

  if (!args.sellerShipFrom) return true;
  const sellerState = normalizeUsStateCode(args.sellerShipFrom.state);
  return sellerState === "TX";
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

export type MarketplaceCheckoutTaxBundle = {
  sessionFields: CheckoutTaxSessionFields;
  taxLineItem: Stripe.Checkout.SessionCreateParams.LineItem | null;
  /** Destination transfer amount when tax is collected as an explicit line item. */
  sellerTransferCents: number | null;
  taxAmountCents: number;
  stripeTaxCalculationId: string | null;
  collectTax: boolean;
  metadata: Record<string, string>;
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
    const shipTo = normalizeShipToAddress(args.shipTo);
    const enabled = await isTaxCollectionEnabledForShipTo(shipTo.shipState, shipTo.shipCountry);
    if (!enabled) return {};
    const customerId = await syncStripeCustomerShippingAddress(args.buyerId, shipTo);
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

/**
 * Pre-calculate sales tax for Connect destination charges and add an explicit Checkout line item.
 * Tax stays on the platform; seller transfer excludes the tax line.
 */
export async function buildMarketplaceCheckoutTaxBundle(args: {
  buyerId: string;
  shipTo: ShipToAddress;
  itemPriceUsd: number;
  shippingPriceUsd: number;
  applicationFeeCents: number;
  sellerShipFrom?: ShipFromAddress | null;
}): Promise<MarketplaceCheckoutTaxBundle> {
  const shipTo = normalizeShipToAddress(args.shipTo);
  const sellerShipFrom = args.sellerShipFrom ? normalizeShipFromAddress(args.sellerShipFrom) : null;
  const itemCents = Math.round(Math.max(0, args.itemPriceUsd) * 100);
  const shippingCents = Math.round(Math.max(0, args.shippingPriceUsd) * 100);
  const feeCents = Math.max(0, Math.round(args.applicationFeeCents));

  const collectTax = await isMarketplaceSaleTaxEligible({ shipTo, sellerShipFrom });
  if (!collectTax) {
    return {
      sessionFields: {},
      taxLineItem: null,
      sellerTransferCents: null,
      taxAmountCents: 0,
      stripeTaxCalculationId: null,
      collectTax: false,
      metadata: {},
    };
  }

  const customerId = await syncStripeCustomerShippingAddress(args.buyerId, shipTo);
  const baseSessionFields: CheckoutTaxSessionFields = {
    customer: customerId,
    customer_update: { shipping: "auto", address: "auto" },
  };

  try {
    const est = await estimateSalesTaxCents({
      itemPriceUsd: args.itemPriceUsd,
      shippingPriceUsd: args.shippingPriceUsd,
      shipTo,
      sellerShipFrom,
    });

    if (est.taxAmountCents > 0) {
      const sellerTransferCents = Math.max(0, itemCents + shippingCents - feeCents);
      return {
        sessionFields: baseSessionFields,
        taxLineItem: {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: est.taxAmountCents,
            tax_behavior: "inclusive",
            product_data: {
              name: "Sales tax",
              tax_code: STRIPE_TAX_CODE_TANGIBLE,
            },
          },
        },
        sellerTransferCents,
        taxAmountCents: est.taxAmountCents,
        stripeTaxCalculationId: est.taxCalculationId,
        collectTax: true,
        metadata: {
          salesTaxCents: String(est.taxAmountCents),
          ...(est.taxCalculationId ? { stripeTaxCalculationId: est.taxCalculationId } : {}),
        },
      };
    }
  } catch (e) {
    console.warn("[stripe-tax] tax calculation failed; falling back to automatic_tax", e);
  }

  return {
    sessionFields: {
      ...baseSessionFields,
      automatic_tax: checkoutAutomaticTaxFields(),
    },
    taxLineItem: null,
    sellerTransferCents: null,
    taxAmountCents: 0,
    stripeTaxCalculationId: null,
    collectTax: true,
    metadata: {},
  };
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
  let taxAmountCents = session.total_details?.amount_tax ?? 0;
  if (taxAmountCents <= 0 && session.metadata?.salesTaxCents) {
    const parsed = Number.parseInt(session.metadata.salesTaxCents, 10);
    if (Number.isFinite(parsed) && parsed > 0) taxAmountCents = parsed;
  }
  const totalAmountCents = session.amount_total ?? null;
  const stripeTaxCalculationId =
    typeof session.metadata?.stripeTaxCalculationId === "string"
      ? session.metadata.stripeTaxCalculationId
      : typeof (session as { tax_calculation?: string | null }).tax_calculation === "string"
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
  sellerShipFrom?: ShipFromAddress | null;
}): Promise<{ taxAmountCents: number; taxCalculationId: string | null; collectTax: boolean }> {
  const shipTo = normalizeShipToAddress(args.shipTo);
  const sellerShipFrom = args.sellerShipFrom ? normalizeShipFromAddress(args.sellerShipFrom) : null;
  const enabled = await isMarketplaceSaleTaxEligible({ shipTo, sellerShipFrom });
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
      tax_behavior: "exclusive",
    });
  }

  let calculation: Stripe.Tax.Calculation;
  try {
    calculation = await stripe.tax.calculations.create({
      currency: "usd",
      line_items: lineItems,
      ...(shippingCents > 0
        ? {
            shipping_cost: {
              amount: shippingCents,
              tax_code: STRIPE_TAX_CODE_SHIPPING,
              tax_behavior: "exclusive",
            },
          }
        : {}),
      customer_details: {
        address: {
          line1: shipTo.shipAddress.slice(0, 500),
          city: shipTo.shipCity.slice(0, 120),
          state: shipTo.shipState,
          postal_code: shipTo.shipZip.slice(0, 32),
          country: shipTo.shipCountry,
        },
        address_source: "shipping",
      },
      ...(sellerShipFrom
        ? {
            ship_from_details: {
              address: {
                line1: sellerShipFrom.line1.slice(0, 500),
                city: sellerShipFrom.city.slice(0, 120),
                state: sellerShipFrom.state,
                postal_code: sellerShipFrom.postalCode.slice(0, 32),
                country: sellerShipFrom.country,
              },
            },
          }
        : {}),
    });
  } catch (e) {
    console.error("[stripe-tax] estimateSalesTaxCents", e);
    const buyerState = normalizeUsStateCode(shipTo.shipState);
    if (buyerState === "TX") {
      return {
        taxAmountCents: texasFallbackTaxCents(itemCents, shippingCents),
        taxCalculationId: null,
        collectTax: true,
      };
    }
    throw e;
  }

  let taxAmountCents = sumTaxBreakdownCents(calculation);
  if (taxAmountCents <= 0 && normalizeUsStateCode(shipTo.shipState) === "TX") {
    taxAmountCents = texasFallbackTaxCents(itemCents, shippingCents);
  }

  return {
    taxAmountCents,
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
