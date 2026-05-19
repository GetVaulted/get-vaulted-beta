/** Mirrors web `live-auction-lot-phase` (mobile bundle cannot import web src). */
const LIVE_AUCTION_CLIENT_END_GRACE_MS = 2500;

export type LiveAuctionLotBidPhase =
  | 'inactive'
  | 'not_started'
  | 'bidding_open'
  | 'timer_ended_unsettled'
  | 'settled';

export type LiveAuctionLotPhaseInput = {
  status: string;
  biddingOpen?: boolean | null;
  auctionEndsAt?: string | null;
};

export const LIVE_AUCTION_HOST_TIMER_ENDED_COPY =
  'Auction ended — mark sold to settle winner.';

export const LIVE_AUCTION_BUYER_TIMER_ENDED_COPY =
  'Bidding closed. The host will confirm the winner — payment opens after they mark sold.';

export const LIVE_AUCTION_BUYER_NOT_STARTED_COPY =
  'Waiting for the host to open bidding — then the button shows the next required bid.';

export function resolveLiveAuctionLotBidPhase(
  item: LiveAuctionLotPhaseInput | null | undefined,
  nowMs: number,
): LiveAuctionLotBidPhase {
  if (!item) return 'inactive';
  if (item.status === 'sold' || item.status === 'skipped') return 'settled';
  if (item.status !== 'active') return 'inactive';

  const endsRaw = item.auctionEndsAt;
  const endsMs = endsRaw ? Date.parse(endsRaw) : NaN;
  const hadScheduledEnd = Boolean(endsRaw && Number.isFinite(endsMs));

  if (hadScheduledEnd && endsMs <= nowMs - LIVE_AUCTION_CLIENT_END_GRACE_MS) {
    return 'timer_ended_unsettled';
  }

  if (item.biddingOpen && hadScheduledEnd && endsMs > nowMs - LIVE_AUCTION_CLIENT_END_GRACE_MS) {
    return 'bidding_open';
  }

  return 'not_started';
}
