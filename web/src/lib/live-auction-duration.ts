/**
 * Host auction clock choices. Keep in sync with the mobile app
 * (`mobile/src/lib/liveAuctionStartPayload.ts`) so sellers see the same timers on phone and PC.
 */
export const DEFAULT_AUCTION_SEC = 15;
export const AUCTION_DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;
