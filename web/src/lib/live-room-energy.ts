/** Room energy score (0–100) from live activity signals — drives HUD glow intensity. */

export type LiveRoomEnergyInput = {
  viewerCount: number;
  /** Chat + bid messages in the last sampling window. */
  recentMessageCount: number;
  /** Bids placed in the last 60 seconds. */
  bidsLastMinute: number;
  /** Whether an auction timer is actively running. */
  auctionLive: boolean;
};

export type LiveRoomEnergyLevel = "calm" | "warming" | "hot" | "electric";

export function computeLiveRoomEnergy(input: LiveRoomEnergyInput): { score: number; level: LiveRoomEnergyLevel } {
  const viewers = Math.max(0, input.viewerCount);
  const msgs = Math.max(0, input.recentMessageCount);
  const bids = Math.max(0, input.bidsLastMinute);

  const viewerPart = Math.min(35, viewers * 2.5);
  const chatPart = Math.min(25, msgs * 2);
  const bidPart = Math.min(30, bids * 8);
  const livePart = input.auctionLive ? 10 : 0;

  const score = Math.round(Math.min(100, Math.max(0, viewerPart + chatPart + bidPart + livePart)));

  let level: LiveRoomEnergyLevel = "calm";
  if (score >= 75) level = "electric";
  else if (score >= 50) level = "hot";
  else if (score >= 25) level = "warming";

  return { score, level };
}

/** Track bid timestamps for bids/minute. */
export function pushBidTimestamp(timestamps: number[], nowMs = Date.now(), windowMs = 60_000): number[] {
  const cutoff = nowMs - windowMs;
  return [...timestamps.filter((t) => t >= cutoff), nowMs];
}

export function countRecentBids(timestamps: number[], nowMs = Date.now(), windowMs = 60_000): number {
  const cutoff = nowMs - windowMs;
  return timestamps.filter((t) => t >= cutoff).length;
}

/** Detect bid war: 3+ bids within 8 seconds. */
export function isBidWar(timestamps: number[], nowMs = Date.now(), windowMs = 8_000, minBids = 3): boolean {
  const cutoff = nowMs - windowMs;
  return timestamps.filter((t) => t >= cutoff).length >= minBids;
}
