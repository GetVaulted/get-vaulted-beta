import { resolveSellerAbsorbedProcessingFeeUsd } from "@/lib/seller-payout-estimate";

/**
 * Processing fee (USD) a PayPal-rail seller absorbs on one order.
 *
 * PayPal-rail orders are platform-held (no Connect transfer), so the processing fee is NOT taken
 * out via an application fee at charge time the way it is on the Stripe rail — it has to be
 * subtracted from the payout itself. Without this, Get Vaulted paid PayPal sellers the full amount
 * and silently absorbed the fee, while the seller's own dashboard (see `map-seller-sales-order`)
 * already showed the fee deducted. Same policy as every other payout view: actual recorded fee when
 * present, otherwise the 2.9% + $0.30 estimate on the buyer charge; company/official listings pass
 * nothing through.
 */
export function paypalRailSellerProcessingFeeUsd(order: {
  listing: { isCompanyListing: boolean };
  stripeProcessingFeeCents?: number | null;
  totalUsd?: number | null;
}): number {
  const totalUsd = Number.isFinite(order.totalUsd) ? Math.max(0, order.totalUsd as number) : 0;
  // No buyer charge on record and no recorded fee: nothing to estimate against.
  if (order.stripeProcessingFeeCents == null && totalUsd <= 0) return 0;
  return resolveSellerAbsorbedProcessingFeeUsd({
    isCompanyListing: order.listing.isCompanyListing,
    stripeProcessingFeeCents: order.stripeProcessingFeeCents,
    buyerChargeTotalUsd: totalUsd,
  });
}
