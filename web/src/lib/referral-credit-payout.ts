/**
 * Platform-funded referral spend on Connect charges.
 *
 * Buyer pays a discounted item price (`Order.itemPriceUsd` after credit).
 * Seller fee + transfer use the full sale basis (`itemPriceUsd + referralCreditAppliedUsd`).
 * The credit is absorbed from the platform fee (marketing). When credit exceeds fee +
 * processing on that charge, the transfer is capped to what the buyer paid for merchandise +
 * shipping (platform fee bottoms at $0; seller cannot be paid more than the charge allows).
 */

/** Full item price for platform fee and seller payout when store credit reduced the buyer line. */
export function orderItemSaleBasisUsd(order: {
  itemPriceUsd: number;
  referralCreditAppliedUsd?: number | null;
  platformCreditAppliedUsd?: number | null;
}): number {
  return (
    Math.max(0, order.itemPriceUsd) +
    Math.max(0, order.referralCreditAppliedUsd ?? 0) +
    Math.max(0, order.platformCreditAppliedUsd ?? 0)
  );
}

export function orderItemSaleBasisCents(order: {
  itemPriceUsd: number;
  referralCreditAppliedUsd?: number | null;
  platformCreditAppliedUsd?: number | null;
}): number {
  return Math.round(orderItemSaleBasisUsd(order) * 100);
}

export function referralCreditAppliedCents(order: {
  referralCreditAppliedUsd?: number | null;
}): number {
  return Math.round(Math.max(0, order.referralCreditAppliedUsd ?? 0) * 100);
}

export function platformCreditAppliedCents(order: {
  platformCreditAppliedUsd?: number | null;
}): number {
  return Math.round(Math.max(0, order.platformCreditAppliedUsd ?? 0) * 100);
}
