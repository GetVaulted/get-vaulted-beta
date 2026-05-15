/**
 * When remaining time on the lot drops **below** this many seconds, an accepted bid resets the
 * clock to this many seconds from server `now` (clutch off, timed lots only).
 */
export const LIVE_AUCTION_BID_SOFT_CLOSE_SEC = 10;

/**
 * Client-side: keep bid affordance visible this long after `auctionEndsAt` to absorb clock skew /
 * polling lag. Still require a scheduled `auctionEndsAt` (host Start sets it) so we never show
 * “live” bidding on `biddingOpen` alone.
 */
export const LIVE_AUCTION_CLIENT_END_GRACE_MS = 2500;

/**
 * After an accepted bid on a timed lot with **clutch off**, extend `auctionEndsAt` only when
 * remaining time is under {@link LIVE_AUCTION_BID_SOFT_CLOSE_SEC}; then set end to
 * `now + LIVE_AUCTION_BID_SOFT_CLOSE_SEC`. Otherwise leave the current end time unchanged.
 * Clutch on or no end time: return `currentAuctionEndsAt` unchanged.
 */
export function computeNextAuctionEndsAtAfterBid(
  now: Date,
  clutchTimeEnabled: boolean,
  currentAuctionEndsAt: Date | null,
): Date | null {
  if (clutchTimeEnabled || !currentAuctionEndsAt) return currentAuctionEndsAt;
  const remainingMs = currentAuctionEndsAt.getTime() - now.getTime();
  if (remainingMs >= LIVE_AUCTION_BID_SOFT_CLOSE_SEC * 1000) {
    return currentAuctionEndsAt;
  }
  return new Date(now.getTime() + LIVE_AUCTION_BID_SOFT_CLOSE_SEC * 1000);
}
