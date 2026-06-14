/** Seller-facing payout copy — keep in sync with Seller Studio fee policy. */
export const VAULTED_PLATFORM_FEE_PERCENT = 8;
export const VAULTED_FEE_RATE_LABEL = '8% of total sales';
export const STRIPE_FEE_RATE_LABEL = '2.9% + $0.30';

/** Sale amount for Get Vaulted fee (item price = total sales; shipping/tax excluded). */
export function sellerTotalSalesUsd(itemPriceUsd: number): number {
  return Math.max(0, itemPriceUsd);
}

export function estimatePlatformFeeUsd(itemPriceUsd: number, platformFeePercent = VAULTED_PLATFORM_FEE_PERCENT): number {
  const base = sellerTotalSalesUsd(itemPriceUsd);
  const pct = Math.max(0, platformFeePercent);
  return Math.max(0, Math.round(((base * pct) / 100) * 100) / 100);
}

/** Stripe card processing on the buyer charge total (2.9% + $0.30). */
export function estimateStripeProcessingFeeUsd(chargeAmountUsd: number): number {
  const charge = Math.max(0, chargeAmountUsd);
  return Math.max(0, Math.round((charge * 0.029 + 0.3) * 100) / 100);
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
