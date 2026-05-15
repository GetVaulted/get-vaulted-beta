/** Minimum next bid must be >= this value (strictly greater than current high). */
export function minNextBidUsd(currentHighUsd: number): number {
  const inc = Math.max(1, Math.ceil(currentHighUsd / 25));
  return currentHighUsd + inc;
}

export function defaultAuctionDurationDays(days: number | null | undefined): number {
  if (days != null && Number.isFinite(days) && days > 0) return Math.floor(days);
  return 7;
}

export function computeAuctionEndsAt(from: Date, durationDays: number | null | undefined): Date {
  const d = defaultAuctionDurationDays(durationDays);
  return new Date(from.getTime() + d * 24 * 60 * 60 * 1000);
}
