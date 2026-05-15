/** Fixed-price random: per-spot buy-in. */
export type LiveBreakFixed = {
  breakType: "fixed";
  id: string;
  title: string;
  viewers: number;
  spotsTotal: number;
  spotsLeft: number;
  pricePerSpot: number;
  imageSeed: string;
  urgencyHeadline: string;
  recentSpotsLine: string;
  lastHitLine: string;
  ctaVerb: "join" | "buy";
};

/** PYT / auction: teams + bids, separate CTAs. */
export type LiveBreakAuction = {
  breakType: "auction";
  id: string;
  title: string;
  viewers: number;
  teamsTotal: number;
  teamsClaimed: number;
  priceLine: string;
  urgencyHeadline: string;
  activityLine: string;
  topBidLine: string;
  ctaVerb: "view_teams" | "enter_auction";
  imageSeed: string;
};

export type LiveBreak = LiveBreakFixed | LiveBreakAuction;
