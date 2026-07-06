/**
 * True (reserve met) / false (reserve open) / null (no reserve set, or bid not yet known).
 * Must compare against the lot's actual reserve price, not its starting/listed price — comparing
 * against priceUsd made "Reserve met" show almost immediately on every lot with any bids (legal/
 * compliance audit 2026-07).
 */
export function computeLiveLotReserveMet(item: {
  reservePriceUsd?: number | null;
  currentBidUsd?: number | null;
}): boolean | null {
  if (
    item.reservePriceUsd == null ||
    !Number.isFinite(item.reservePriceUsd) ||
    item.currentBidUsd == null ||
    !Number.isFinite(item.currentBidUsd)
  ) {
    return null;
  }
  return item.currentBidUsd >= item.reservePriceUsd;
}
