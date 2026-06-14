import type { SellerSalesOrderDetail } from '../api/sellerSalesRepository';

export type SellerOrderTotals = {
  itemPriceUsd: number;
  shippingPriceUsd: number;
  taxUsd: number;
  totalUsd: number;
};

function coerceUsd(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Authoritative buyer-charge breakdown for seller order detail. */
export function resolveSellerOrderTotals(
  order: Pick<
    SellerSalesOrderDetail,
    'itemPriceUsd' | 'shippingPriceUsd' | 'taxUsd' | 'taxAmountCents' | 'totalUsd'
  >,
): SellerOrderTotals {
  const totalUsd = coerceUsd(order.totalUsd);
  const shippingPriceUsd = coerceUsd(order.shippingPriceUsd);
  let taxUsd = coerceUsd(order.taxUsd);
  const taxAmountCents = coerceUsd(order.taxAmountCents);
  if (taxAmountCents > 0) {
    taxUsd = Math.max(taxUsd, roundUsd(taxAmountCents / 100));
  }

  let itemPriceUsd = coerceUsd(order.itemPriceUsd);

  if (totalUsd > 0) {
    const derivedItem = roundUsd(totalUsd - shippingPriceUsd - taxUsd);
    if (itemPriceUsd <= 0 && derivedItem > 0) {
      itemPriceUsd = derivedItem;
    } else if (itemPriceUsd > 0) {
      const sum = roundUsd(itemPriceUsd + shippingPriceUsd + taxUsd);
      if (Math.abs(sum - totalUsd) > 0.02) {
        itemPriceUsd = Math.max(0, derivedItem);
      }
    }
  }

  const resolvedTotal =
    totalUsd > 0 ? totalUsd : roundUsd(itemPriceUsd + shippingPriceUsd + taxUsd);

  return {
    itemPriceUsd,
    shippingPriceUsd,
    taxUsd,
    totalUsd: resolvedTotal,
  };
}
