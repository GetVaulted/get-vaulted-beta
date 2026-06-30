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
  itemPriceUsd: number;
  shippingPriceUsd: number;
  applicationFeeCents: number;
  sellerId?: string;
  sellerShipFrom?: ShipFromAddress | null;
}): Promise<ConnectPaymentTaxPlan> {
  const feeCents = Math.max(0, Math.round(args.applicationFeeCents));
  const itemCents = Math.round(Math.max(0, args.itemPriceUsd) * 100);
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
  const sellerTransferCents = Math.max(0, subtotalCents - feeCents);
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
}): {
  application_fee_amount?: number;
  transfer_data: { destination: string; amount?: number };
} {
  if (args.sellerTransferCents != null) {
    return {
      transfer_data: {
        destination: args.destinationAccountId,
        amount: args.sellerTransferCents,
      },
    };
  }
  return {
    application_fee_amount: args.applicationFeeCents,
    transfer_data: { destination: args.destinationAccountId },
  };
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
