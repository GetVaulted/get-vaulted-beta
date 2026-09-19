export const DEFAULT_AUCTION_SEC = 15;
export const AUCTION_DURATION_PRESETS = [15, 30, 45, 60] as const;
export type AuctionDurationSec = (typeof AUCTION_DURATION_PRESETS)[number];

/** Clamp host-selected duration to the live startAuction API range (3–7200s). */
export function clampAuctionDurationSec(sec: number, fallback = DEFAULT_AUCTION_SEC): number {
  if (!Number.isFinite(sec)) return fallback;
  return Math.min(7200, Math.max(3, Math.round(sec)));
}

export function buildHostStartAuctionPatch(args: {
  auctionDurationSec: number;
  clutchTimeEnabled: boolean;
}): {
  action: 'startAuction';
  auctionDurationSec: number;
  clutchTimeEnabled: boolean;
} {
  return {
    action: 'startAuction',
    auctionDurationSec: clampAuctionDurationSec(args.auctionDurationSec),
    clutchTimeEnabled: args.clutchTimeEnabled,
  };
}
