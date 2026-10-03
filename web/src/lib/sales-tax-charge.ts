import {
  resolveTaxCollectionForDestination,
  type TaxCollectionBasis,
} from "@/lib/sales-tax-jurisdiction";
import { buildOrderTaxPersistFields, type OrderTaxPersistFields } from "@/lib/sales-tax-order";
import {
  estimateSalesTaxCents,
  loadSellerShipFromForTax,
  type ShipFromAddress,
  type ShipToAddress,
} from "@/lib/stripe-tax";

export type ConnectPaymentTaxPlan = {
  collectTax: boolean;
  taxAmountCents: number;
  amountCents: number;
  sellerTransferCents: number | null;
  applicationFeeCents: number;
  orderTax: OrderTaxPersistFields;
  stripeTaxCalculationId: string | null;
  taxJurisdictionState: string | null;
  taxCollectionBasis: TaxCollectionBasis | null;
  metadata: Record<string, string>;
};

/** Resolve buyer charge and seller transfer for Connect destination charges with sales tax. */
export async function resolveConnectPaymentTaxPlan(args: {
  shipTo: ShipToAddress;
  /** Buyer-paid item (after optional referral discount). Tax is based on this amount. */
  itemPriceUsd: number;
  shippingPriceUsd: number;
  applicationFeeCents: number;
  /**
   * Platform-funded store credit already subtracted from `itemPriceUsd`. Seller transfer uses
   * full item (`itemPriceUsd + referral + platform credit`) so the seller is not cut.
   */
  referralCreditAppliedUsd?: number | null;
  platformCreditAppliedUsd?: number | null;
  sellerId?: string;
  sellerShipFrom?: ShipFromAddress | null;
}): Promise<ConnectPaymentTaxPlan> {
  const feeCents = Math.max(0, Math.round(args.applicationFeeCents));
  const itemCents = Math.round(Math.max(0, args.itemPriceUsd) * 100);
  const creditCents =
    Math.round(Math.max(0, args.referralCreditAppliedUsd ?? 0) * 100) +
    Math.round(Math.max(0, args.platformCreditAppliedUsd ?? 0) * 100);
  const fullItemCents = itemCents + creditCents;
  const shippingCents = Math.round(Math.max(0, args.shippingPriceUsd) * 100);
  const subtotalCents = itemCents + shippingCents;

  const decision = await resolveTaxCollectionForDestination({
    shipState: args.shipTo.shipState,
    shipCountry: args.shipTo.shipCountry,
  });

  if (!decision.collect) {
    const orderTax = buildOrderTaxPersistFields({
      itemPriceUsd: args.itemPriceUsd,
      shippingPriceUsd: args.shippingPriceUsd,
      taxAmountCents: 0,
      taxJurisdictionState: decision.stateCode,
      taxCollectionBasis: decision.collectionBasis,
    });
    return {
      collectTax: false,
      taxAmountCents: 0,
      amountCents: subtotalCents,
      sellerTransferCents: null,
      applicationFeeCents: feeCents,
      orderTax,
      stripeTaxCalculationId: null,
      taxJurisdictionState: decision.stateCode,
      taxCollectionBasis: decision.collectionBasis,
      metadata: {},
    };
  }

  const sellerShipFrom =
    args.sellerShipFrom ??
    (args.sellerId ? await loadSellerShipFromForTax(args.sellerId) : null);

  const est = await estimateSalesTaxCents({
    itemPriceUsd: args.itemPriceUsd,
    shippingPriceUsd: args.shippingPriceUsd,
    shipTo: args.shipTo,
    sellerShipFrom,
  });

  const taxAmountCents = Math.max(0, est.taxAmountCents);
  // Seller transfer on full sale basis; processing is subtracted later in connect helpers.
  const sellerTransferCents = Math.max(0, fullItemCents + shippingCents - feeCents);
  const amountCents = subtotalCents + taxAmountCents;

  const orderTax = buildOrderTaxPersistFields({
    itemPriceUsd: args.itemPriceUsd,
    shippingPriceUsd: args.shippingPriceUsd,
    taxAmountCents,
    stripeTaxCalculationId: est.taxCalculationId,
    taxJurisdictionState: decision.stateCode,
    taxCollectionBasis: decision.collectionBasis,
  });

  const metadata: Record<string, string> = {};
  if (taxAmountCents > 0) {
    metadata.salesTaxCents = String(taxAmountCents);
    if (est.taxCalculationId) metadata.stripeTaxCalculationId = est.taxCalculationId;
    if (decision.stateCode) metadata.taxJurisdictionState = decision.stateCode;
  }

  return {
    collectTax: taxAmountCents > 0,
    taxAmountCents,
    amountCents,
    sellerTransferCents: taxAmountCents > 0 ? sellerTransferCents : null,
    applicationFeeCents: feeCents,
    orderTax,
    stripeTaxCalculationId: est.taxCalculationId,
    taxJurisdictionState: decision.stateCode,
    taxCollectionBasis: decision.collectionBasis,
    metadata,
  };
}

export function connectPaymentIntentTransferData(args: {
  destinationAccountId: string;
  applicationFeeCents: number;
  sellerTransferCents: number | null;
  /**
   * Stripe processing fee (cents) passed through to the seller so the platform nets its full
   * application fee. Added to `application_fee_amount` (untaxed) or subtracted from the explicit
   * seller transfer (taxed). Defaults to 0 (platform absorbs), e.g. tips.
   */
  processingFeeCents?: number;
  /**
   * Platform-funded referral credit (cents). Untaxed path: reduces `application_fee_amount`.
   * Taxed path: transfer is clamped to `maxSellerTransferCents` when set.
   */
  referralCreditAppliedCents?: number;
  /** Max transfer ex-tax (buyer item + shipping). Caps transfer when credit exceeds fee + processing. */
  maxSellerTransferCents?: number;
}): {
  application_fee_amount?: number;
  transfer_data: { destination: string; amount?: number };
} {
  const processing = Math.max(0, Math.round(args.processingFeeCents ?? 0));
  const credit = Math.max(0, Math.round(args.referralCreditAppliedCents ?? 0));
  if (args.sellerTransferCents != null) {
    let amount = Math.max(0, args.sellerTransferCents - processing);
    if (args.maxSellerTransferCents != null) {
      amount = Math.min(amount, Math.max(0, Math.round(args.maxSellerTransferCents)));
    }
    return {
      transfer_data: {
        destination: args.destinationAccountId,
        amount,
      },
    };
  }
  return {
    application_fee_amount: Math.max(0, args.applicationFeeCents + processing - credit),
    transfer_data: { destination: args.destinationAccountId },
  };
}

/**
 * When seller payout rail is PayPal, omit Connect transfer so the charge stays on the platform.
 * Otherwise apply standard destination-charge transfer params.
 */
export function connectOrPlatformHeldPaymentIntentTransferData(args: {
  sellerPayoutProcessor: "STRIPE" | "PAYPAL";
  destinationAccountId: string | null;
  applicationFeeCents: number;
  sellerTransferCents: number | null;
  processingFeeCents?: number;
  referralCreditAppliedCents?: number;
  maxSellerTransferCents?: number;
}): {
  application_fee_amount?: number;
  transfer_data?: { destination: string; amount?: number };
} {
  if (args.sellerPayoutProcessor === "PAYPAL" || !args.destinationAccountId?.trim()) {
    return {};
  }
  return connectPaymentIntentTransferData({
    destinationAccountId: args.destinationAccountId.trim(),
    applicationFeeCents: args.applicationFeeCents,
    sellerTransferCents: args.sellerTransferCents,
    processingFeeCents: args.processingFeeCents,
    referralCreditAppliedCents: args.referralCreditAppliedCents,
    maxSellerTransferCents: args.maxSellerTransferCents,
  });
}

export function fullRefundAmountCents(order: {
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxAmountCents: number;
}): number {
  const itemCents = Math.round(Math.max(0, order.itemPriceUsd) * 100);
  const shippingCents = Math.round(Math.max(0, order.shippingPriceUsd) * 100);
  const taxCents = Math.max(0, order.taxAmountCents ?? 0);
  return itemCents + shippingCents + taxCents;
}

/**
 * NOT CURRENTLY WIRED UP. Partial refunds are an explicitly unsupported product flow today — no
 * UI/API path calls this function (`executeOrderRefund` always refunds the full order via
 * `fullRefundAmountCents`, and the `charge.refunded` webhook flags any partial refund it observes
 * for manual review rather than acting on it — see `payments.ts`). Kept/tested as a starting point
 * for a future partial-refund feature; do not assume it is reachable from production code paths.
 */
export function proratedRefundAmountCents(
  order: { itemPriceUsd: number; shippingPriceUsd: number; taxAmountCents: number },
  refundItemUsd: number,
): { refundCents: number; taxRefundedCents: number } {
  const itemCents = Math.round(Math.max(0, order.itemPriceUsd) * 100);
  const shippingCents = Math.round(Math.max(0, order.shippingPriceUsd) * 100);
  const taxCents = Math.max(0, order.taxAmountCents ?? 0);
  const refundItemCents = Math.round(Math.max(0, refundItemUsd) * 100);

  if (itemCents <= 0 || refundItemCents <= 0) {
    return { refundCents: 0, taxRefundedCents: 0 };
  }

  const ratio = Math.min(1, refundItemCents / itemCents);
  const shippingRefundCents = Math.round(shippingCents * ratio);
  const taxRefundedCents = Math.round(taxCents * ratio);
  const refundCents = refundItemCents + shippingRefundCents + taxRefundedCents;

  return { refundCents, taxRefundedCents };
}
