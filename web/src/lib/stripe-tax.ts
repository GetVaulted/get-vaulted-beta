import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { moneyFlowLog } from "@/lib/money-flow-log";
import {
  isMarketplaceSaleTaxEligible,
  resolveTaxCollectionForDestination,
  type TaxCollectionBasis,
} from "@/lib/sales-tax-jurisdiction";
import { ensureStripeCustomerIdForUser } from "@/lib/stripe-customer";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { normalizeUsStateCode } from "@/lib/us-state-code";

export { normalizeUsStateCode } from "@/lib/us-state-code";

const TAX_CALC_CACHE_TTL_MS = 10 * 60 * 1000;
type TaxCalcCacheEntry = {
  expiresAt: number;
  result: { taxAmountCents: number; taxCalculationId: string | null; collectTax: boolean };
};
const taxCalcCache = new Map<string, TaxCalcCacheEntry>();
const taxCalcInflight = new Map<
  string,
  Promise<{ taxAmountCents: number; taxCalculationId: string | null; collectTax: boolean }>
>();

/** Test-only: clear tax calculation fingerprint cache. */
export function resetTaxCalculationCacheForTests(): void {
  taxCalcCache.clear();
  taxCalcInflight.clear();
}

export function taxCalculationFingerprint(args: {
  itemCents: number;
  shippingCents: number;
  shipTo: ShipToAddress;
  sellerShipFrom?: ShipFromAddress | null;
}): string {
  const to = normalizeShipToAddress(args.shipTo);
  const from = args.sellerShipFrom ? normalizeShipFromAddress(args.sellerShipFrom) : null;
  return [
    args.itemCents,
    args.shippingCents,
    to.shipCountry,
    to.shipState,
    to.shipZip,
    to.shipCity.toLowerCase(),
    to.shipAddress.toLowerCase().slice(0, 80),
    from?.country ?? "",
    from?.state ?? "",
    from?.postalCode ?? "",
  ].join("|");
}

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

export { isMarketplaceSaleTaxEligible, resolveTaxCollectionForDestination };
export type { TaxCollectionBasis };

/** Whether Get Vaulted should collect sales tax for this ship-to (nexus gate). */
export async function isTaxCollectionEnabledForShipTo(
  state: string | null | undefined,
  country: string | null | undefined,
): Promise<boolean> {
  const decision = await resolveTaxCollectionForDestination({ shipState: state, shipCountry: country });
  return decision.collect;
}

/** Saved-card charges can include tax via resolveConnectPaymentTaxPlan; kept for legacy callers. */
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

/**
 * Stripe Connect destination charges: `application_fee_amount` and `transfer_data.amount`
 * are mutually exclusive. When tax is a separate line item, set an explicit transfer so the
 * seller receives item + shipping minus platform fee; the platform keeps fee + tax.
 */
export function connectCheckoutPaymentIntentData(args: {
  destinationAccountId: string;
  applicationFeeCents: number;
  sellerTransferCents: number | null;
  metadata: Record<string, string>;
  /**
   * Stripe processing fee (cents) passed through to the seller so the platform nets its full
   * application fee. Added to `application_fee_amount` (untaxed) or subtracted from the explicit
   * seller transfer (taxed). Defaults to 0 (platform absorbs).
   */
  processingFeeCents?: number;
}): Pick<
  Stripe.Checkout.SessionCreateParams.PaymentIntentData,
  "application_fee_amount" | "transfer_data" | "metadata"
> {
  const processing = Math.max(0, Math.round(args.processingFeeCents ?? 0));
  if (args.sellerTransferCents != null) {
    return {
      transfer_data: {
        destination: args.destinationAccountId,
        amount: Math.max(0, args.sellerTransferCents - processing),
      },
      metadata: args.metadata,
    };
  }
  return {
    application_fee_amount: args.applicationFeeCents + processing,
    transfer_data: { destination: args.destinationAccountId },
    metadata: args.metadata,
  };
}

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
        // Explicit tax line item — no automatic_tax or customer on Connect destination checkout.
        sessionFields: {},
        taxLineItem: {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: est.taxAmountCents,
            product_data: {
              name: "Sales tax",
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
    console.warn("[stripe-tax] tax calculation failed; proceeding without explicit tax line", e);
  }

  // Connect destination charges cannot reliably use automatic_tax — skip rather than fail checkout.
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

/** Read buyer-paid tax from a succeeded PaymentIntent (live saved-card / Connect charges). */
export function extractTaxFromPaymentIntent(paymentIntent: Stripe.PaymentIntent): ExtractedCheckoutTax {
  let taxAmountCents = 0;
  if (paymentIntent.metadata?.salesTaxCents) {
    const parsed = Number.parseInt(paymentIntent.metadata.salesTaxCents, 10);
    if (Number.isFinite(parsed) && parsed > 0) taxAmountCents = parsed;
  }
  const stripeTaxCalculationId =
    typeof paymentIntent.metadata?.stripeTaxCalculationId === "string"
      ? paymentIntent.metadata.stripeTaxCalculationId
      : null;
  return {
    taxAmountCents,
    taxUsd: taxAmountCents / 100,
    stripeTaxCalculationId,
    totalAmountCents: paymentIntent.amount_received ?? paymentIntent.amount ?? null,
  };
}

export async function fetchPaymentIntentTax(paymentIntentId: string): Promise<ExtractedCheckoutTax | null> {
  const id = paymentIntentId.trim();
  if (!id || !isStripeConfigured()) return null;
  try {
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(id);
    return extractTaxFromPaymentIntent(paymentIntent);
  } catch (e) {
    console.error("[stripe-tax] fetchPaymentIntentTax", e);
    return null;
  }
}

/** Estimate sales tax via Stripe Tax Calculation API (no hardcoded rates). Fingerprint-cached. */
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

  const fingerprint = taxCalculationFingerprint({
    itemCents,
    shippingCents,
    shipTo,
    sellerShipFrom,
  });
  const cached = taxCalcCache.get(fingerprint);
  if (cached && cached.expiresAt > Date.now()) {
    moneyFlowLog("tax_calculation_reused", {
      fingerprint,
      taxCalculationId: cached.result.taxCalculationId,
      taxAmountCents: cached.result.taxAmountCents,
    });
    return cached.result;
  }

  const inflight = taxCalcInflight.get(fingerprint);
  if (inflight) return inflight;

  const run = (async () => {
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
      calculation = await stripe.tax.calculations.create(
        {
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
        },
        { idempotencyKey: `taxcalc_${fingerprint}`.slice(0, 255) },
      );
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

    const result = {
      taxAmountCents,
      taxCalculationId: calculation.id ?? null,
      collectTax: true as const,
    };
    taxCalcCache.set(fingerprint, { expiresAt: Date.now() + TAX_CALC_CACHE_TTL_MS, result });
    moneyFlowLog("tax_calculation_created", {
      fingerprint,
      taxCalculationId: result.taxCalculationId,
      taxAmountCents: result.taxAmountCents,
    });
    return result;
  })();

  taxCalcInflight.set(fingerprint, run);
  try {
    return await run;
  } finally {
    taxCalcInflight.delete(fingerprint);
  }
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

/**
 * Record a completed sale against Stripe Tax so it appears in Stripe's own tax reporting/filing
 * dashboard. Idempotent: same calculation / `tax_txn_${orderId}` key returns the existing txn.
 * Persists `Order.stripeTaxTransactionId` when `persistToOrderId` is set. Never throws.
 */
export async function recordStripeTaxTransaction(args: {
  taxCalculationId: string | null;
  reference: string;
  /** When set, skip Stripe if the order already has a tax transaction id. */
  persistToOrderId?: string | null;
}): Promise<string | null> {
  if (!args.taxCalculationId || !isStripeConfigured()) return null;

  const orderId = args.persistToOrderId?.trim() || null;
  if (orderId) {
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      select: { stripeTaxTransactionId: true },
    });
    if (existing?.stripeTaxTransactionId) {
      moneyFlowLog("tax_transaction_skipped_duplicate", {
        orderId,
        stripeTaxTransactionId: existing.stripeTaxTransactionId,
      });
      return existing.stripeTaxTransactionId;
    }
  }

  try {
    const stripe = getStripe();
    const txn = await stripe.tax.transactions.createFromCalculation(
      {
        calculation: args.taxCalculationId,
        reference: args.reference,
      },
      { idempotencyKey: `tax_txn_${args.reference}`.slice(0, 255) },
    );
    const txnId = typeof txn.id === "string" ? txn.id : null;
    moneyFlowLog("tax_transaction_created", {
      reference: args.reference,
      taxCalculationId: args.taxCalculationId,
      stripeTaxTransactionId: txnId,
    });
    if (orderId && txnId) {
      await prisma.order.updateMany({
        where: { id: orderId, stripeTaxTransactionId: null },
        data: { stripeTaxTransactionId: txnId },
      });
    }
    return txnId;
  } catch (e) {
    console.error("[stripe-tax] recordStripeTaxTransaction failed", args.reference, args.taxCalculationId, e);
    return null;
  }
}

/**
 * Reverse a Stripe Tax transaction after a refund that returns sales tax to the buyer.
 * Idempotent via order column + Stripe idempotency key. Never throws.
 */
export async function reverseStripeTaxTransaction(args: {
  orderId: string;
  /** Portion of original tax being refunded (cents). Full remaining tax when omitted. */
  reverseAmountCents?: number | null;
  reason?: string;
}): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: {
      stripeTaxTransactionId: true,
      stripeTaxTransactionReversalId: true,
      taxAmountCents: true,
      taxRefundedCents: true,
    },
  });
  if (!order?.stripeTaxTransactionId) return null;
  if (order.stripeTaxTransactionReversalId) {
    moneyFlowLog("tax_transaction_skipped_duplicate", {
      orderId: args.orderId,
      stripeTaxTransactionReversalId: order.stripeTaxTransactionReversalId,
      kind: "reversal",
    });
    return order.stripeTaxTransactionReversalId;
  }

  const originalTax = Math.max(0, order.taxAmountCents ?? 0);
  const alreadyRefunded = Math.max(0, order.taxRefundedCents ?? 0);
  const reverseCents =
    args.reverseAmountCents != null
      ? Math.max(0, Math.round(args.reverseAmountCents))
      : Math.max(0, originalTax - alreadyRefunded);
  if (reverseCents <= 0 || originalTax <= 0) return null;

  try {
    const stripe = getStripe();
    const reversal = await stripe.tax.transactions.createReversal(
      {
        original_transaction: order.stripeTaxTransactionId,
        reference: `${args.orderId}_tax_rev`,
        mode: reverseCents >= originalTax ? "full" : "partial",
        ...(reverseCents < originalTax
          ? {
              flat_amount: -reverseCents,
            }
          : {}),
        metadata: {
          orderId: args.orderId,
          reason: (args.reason ?? "refund").slice(0, 500),
        },
      },
      { idempotencyKey: `tax_rev_${args.orderId}_${reverseCents}`.slice(0, 255) },
    );
    const reversalId = typeof reversal.id === "string" ? reversal.id : null;
    moneyFlowLog("tax_transaction_reversed", {
      orderId: args.orderId,
      stripeTaxTransactionId: order.stripeTaxTransactionId,
      stripeTaxTransactionReversalId: reversalId,
      reverseCents,
    });
    if (reversalId) {
      await prisma.order.updateMany({
        where: { id: args.orderId, stripeTaxTransactionReversalId: null },
        data: { stripeTaxTransactionReversalId: reversalId },
      });
    }
    return reversalId;
  } catch (e) {
    console.error("[stripe-tax] reverseStripeTaxTransaction failed", args.orderId, e);
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
