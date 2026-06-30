/** Seller-facing payout copy — keep in sync with Seller Studio fee policy. */
/** Fallback when policy API is unavailable — keep aligned with web default. */
export const VAULTED_PLATFORM_FEE_PERCENT_FALLBACK = 8;

/** @deprecated Use usePlatformFee().platformFeePercent — kept for offline fallbacks. */
export const VAULTED_PLATFORM_FEE_PERCENT = VAULTED_PLATFORM_FEE_PERCENT_FALLBACK;

export function vaultedFeeRateLabel(platformFeePercent: number): string {
  const pct = Number.isFinite(platformFeePercent) ? platformFeePercent : VAULTED_PLATFORM_FEE_PERCENT_FALLBACK;
  const formatted = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted}% of total sales`;
}

/** @deprecated Use usePlatformFee().feeRateLabel */
export const VAULTED_FEE_RATE_LABEL = vaultedFeeRateLabel(VAULTED_PLATFORM_FEE_PERCENT_FALLBACK);
export const STRIPE_FEE_RATE_LABEL = '2.9% + $0.30';

/** Sale amount for Get Vaulted fee (item price = total sales; shipping/tax excluded). */
export function sellerTotalSalesUsd(itemPriceUsd: number): number {
  return Math.max(0, itemPriceUsd);
}

export function estimatePlatformFeeUsd(
  itemPriceUsd: number,
  platformFeePercent = VAULTED_PLATFORM_FEE_PERCENT_FALLBACK,
): number {
  const base = sellerTotalSalesUsd(itemPriceUsd);
  const pct = Math.max(0, platformFeePercent);
  return Math.max(0, Math.round(((base * pct) / 100) * 100) / 100);
}

/** Stripe card processing on the buyer charge total (2.9% + $0.30). */
export function estimateStripeProcessingFeeUsd(chargeAmountUsd: number): number {
  const charge = Math.max(0, chargeAmountUsd);
  return Math.max(0, Math.round((charge * 0.029 + 0.3) * 100) / 100);
}

export type ListingPayoutEstimate = {
  itemPriceUsd: number;
  platformFeeUsd: number;
  stripeProcessingFeeUsd: number;
  estimatedPayoutUsd: number;
};

/** Item-price-only preview while creating a listing (before shipping/tax are known). */
export function estimateListingPayoutFromItemPrice(
  itemPriceUsd: number,
  platformFeePercent = VAULTED_PLATFORM_FEE_PERCENT_FALLBACK,
): ListingPayoutEstimate | null {
  const item = Math.max(0, itemPriceUsd);
  if (item <= 0) return null;
  const platformFeeUsd = estimatePlatformFeeUsd(item, platformFeePercent);
  const stripeProcessingFeeUsd = estimateStripeProcessingFeeUsd(item);
  const estimatedPayoutUsd = Math.max(
    0,
    Math.round((item - platformFeeUsd - stripeProcessingFeeUsd) * 100) / 100,
  );
  return { itemPriceUsd: item, platformFeeUsd, stripeProcessingFeeUsd, estimatedPayoutUsd };
}

export function formatUsdMoney(amountUsd: number): string {
  return amountUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export type SellerPayoutStatusDisplay = {
  title: string;
  detail?: string;
};

export function formatSellerPayoutStatus(status: string): SellerPayoutStatusDisplay {
  const key = status.trim().toLowerCase();

  if (key === 'held' || key === 'pending') {
    return {
      title: 'Hold',
      detail: 'This will change after delivery plus a 3-day hold period.',
    };
  }
  if (key === 'paid_out') {
    return { title: 'Paid out' };
  }
  if (key === 'instant_payout_ready') {
    return { title: 'Instant payout ready' };
  }
  if (key === 'fast_payout_ready') {
    return { title: 'Fast payout ready' };
  }
  if (key === 'label_payout_ready') {
    return { title: 'Label payout ready' };
  }
  if (key === 'blocked') {
    return { title: 'Blocked' };
  }
  if (key === 'manual_review') {
    return { title: 'Manual review' };
  }

  return { title: status.replace(/_/g, ' ') };
}
