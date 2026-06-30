import type { TaxCollectionBasis } from "@/lib/sales-tax-jurisdiction";
import { TAX_PROVIDER_STRIPE } from "@/lib/stripe-tax";

export type OrderTaxPersistFields = {
  taxUsd: number;
  taxAmountCents: number;
  taxProvider: string | null;
  stripeTaxCalculationId: string | null;
  taxJurisdictionState: string | null;
  taxTaxableSubtotalCents: number;
  taxShippingTaxableCents: number;
  taxCalculatedAt: Date;
  taxCollectionBasis: TaxCollectionBasis | null;
  totalUsd: number;
};

export function buildOrderTaxPersistFields(args: {
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxAmountCents: number;
  stripeTaxCalculationId?: string | null;
  taxJurisdictionState?: string | null;
  taxCollectionBasis?: TaxCollectionBasis | null;
  calculatedAt?: Date;
}): OrderTaxPersistFields {
  const itemCents = Math.round(Math.max(0, args.itemPriceUsd) * 100);
  const shippingCents = Math.round(Math.max(0, args.shippingPriceUsd) * 100);
  const taxAmountCents = Math.max(0, Math.round(args.taxAmountCents));
  const taxUsd = taxAmountCents / 100;
  const totalUsd = args.itemPriceUsd + args.shippingPriceUsd + taxUsd;

  return {
    taxUsd,
    taxAmountCents,
    taxProvider: taxAmountCents > 0 ? TAX_PROVIDER_STRIPE : null,
    stripeTaxCalculationId: args.stripeTaxCalculationId ?? null,
    taxJurisdictionState: args.taxJurisdictionState ?? null,
    taxTaxableSubtotalCents: itemCents,
    taxShippingTaxableCents: shippingCents,
    taxCalculatedAt: args.calculatedAt ?? new Date(),
    taxCollectionBasis: args.taxCollectionBasis ?? null,
    totalUsd,
  };
}

export function orderTaxUpdateData(fields: OrderTaxPersistFields) {
  return {
    taxUsd: fields.taxUsd,
    taxAmountCents: fields.taxAmountCents,
    taxProvider: fields.taxProvider,
    stripeTaxCalculationId: fields.stripeTaxCalculationId,
    taxJurisdictionState: fields.taxJurisdictionState,
    taxTaxableSubtotalCents: fields.taxTaxableSubtotalCents,
    taxShippingTaxableCents: fields.taxShippingTaxableCents,
    taxCalculatedAt: fields.taxCalculatedAt,
    taxCollectionBasis: fields.taxCollectionBasis,
    totalUsd: fields.totalUsd,
  };
}
