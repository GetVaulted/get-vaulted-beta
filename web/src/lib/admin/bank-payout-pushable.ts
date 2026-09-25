/**
 * Pure money-safety helpers for admin seller bank payouts.
 * Pushable never exceeds Connect available; FIFO stops before overpay.
 */

export function bankPayoutPushableUsd(owedUsd: number, availableUsd: number): number {
  const owed = Math.max(0, Number.isFinite(owedUsd) ? owedUsd : 0);
  const available = Math.max(0, Number.isFinite(availableUsd) ? availableUsd : 0);
  return Math.min(owed, available);
}

export type FifoPayoutOrder = {
  orderId: string;
  estimatedNetUsdCents: number;
};

/**
 * Select oldest-first orders whose nets fit in remaining available cents.
 * Stops at the first order that would overdraw (does not skip ahead).
 */
export function selectFifoOrdersWithinAvailable(args: {
  ordersOldestFirst: FifoPayoutOrder[];
  availableUsdCents: number;
}): { selected: FifoPayoutOrder[]; remainingUsdCents: number; stoppedOnOrderId: string | null } {
  const selected: FifoPayoutOrder[] = [];
  let remaining = Math.max(0, Math.floor(args.availableUsdCents));
  let stoppedOnOrderId: string | null = null;

  for (const o of args.ordersOldestFirst) {
    const need = Math.max(0, Math.floor(o.estimatedNetUsdCents));
    if (need < 1) {
      selected.push(o);
      continue;
    }
    if (need > remaining) {
      stoppedOnOrderId = o.orderId;
      break;
    }
    selected.push(o);
    remaining -= need;
  }

  return { selected, remainingUsdCents: remaining, stoppedOnOrderId };
}
