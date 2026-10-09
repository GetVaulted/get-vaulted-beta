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

/**
 * One lump-sum payout: the oldest orders that fully fit, PLUS the leftover balance up to (never past) the
 * next order that did not fit. So a seller with $235.14 available and shipped orders waiting gets exactly
 * $235.14 in one payout, not a handful of smaller ones. When every ready order fits, nothing extra is swept:
 * whatever else sits in the balance belongs to orders that have not shipped yet and stays held.
 */
export function planLumpPayoutCents(args: {
  ordersOldestFirst: FifoPayoutOrder[];
  availableUsdCents: number;
}): {
  coveredOrderIds: string[];
  coveredCents: number;
  sweepCents: number;
  lumpCents: number;
  stoppedOnOrderId: string | null;
} {
  const fifo = selectFifoOrdersWithinAvailable(args);
  const coveredCents = fifo.selected.reduce((sum, o) => sum + Math.max(0, Math.floor(o.estimatedNetUsdCents)), 0);
  const sweepCents = fifo.stoppedOnOrderId ? fifo.remainingUsdCents : 0;
  return {
    coveredOrderIds: fifo.selected.map((o) => o.orderId),
    coveredCents,
    sweepCents,
    lumpCents: coveredCents + sweepCents,
    stoppedOnOrderId: fifo.stoppedOnOrderId,
  };
}
