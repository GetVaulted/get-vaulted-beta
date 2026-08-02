/**
 * Clients (esp. Hold-to-Bid) sometimes send an inflated `amountUsd` after a multi-qty unit
 * change: the same `itemId` keeps a local "next min" floor from the prior unit while the UI
 * already shows the new opening. Hold always pairs `maxProxyUsd === amountUsd`; Exact omits
 * `maxProxyUsd`; Max sends `maxProxyUsd > amountUsd`.
 *
 * Server is authoritative: never let a hold/max payload jump past the true min next.
 * Exact (no maxProxy) may still jump the hammer on purpose.
 */
export function clampLiveHostLotBidAmounts(args: {
  amountUsd: number;
  maxProxyUsd: number | undefined;
  minBidUsd: number;
}): { amountUsd: number; maxProxyUsd: number | undefined } {
  const minBid = args.minBidUsd;
  const amount = args.amountUsd;
  const maxProxy = args.maxProxyUsd;

  if (!(minBid > 0) || !Number.isFinite(minBid)) {
    return { amountUsd: amount, maxProxyUsd: maxProxy };
  }

  // Max / reserve: place at server min; keep the buyer's ceiling.
  if (maxProxy != null && Number.isFinite(maxProxy) && maxProxy > amount + 0.001) {
    return { amountUsd: minBid, maxProxyUsd: Math.max(maxProxy, minBid) };
  }

  // Hold-to-bid pattern (maxProxy === amount): clamp inflated floors to min next.
  if (maxProxy != null && Number.isFinite(maxProxy) && Math.abs(maxProxy - amount) <= 0.001) {
    if (amount > minBid + 0.001) {
      return { amountUsd: minBid, maxProxyUsd: minBid };
    }
    return { amountUsd: amount, maxProxyUsd: amount };
  }

  // Exact (or legacy with no maxProxy): allow amount >= min as sent.
  return { amountUsd: amount, maxProxyUsd: maxProxy };
}
