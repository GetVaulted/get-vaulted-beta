import type { LiveNowRoom } from "@/content/live-rooms";

export type LiveCardSignals = {
  primary: string;
  secondary: string;
};

function firstInt(text: string): number {
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function compactViewers(viewers: number): string {
  return viewers >= 1000 ? `${(viewers / 1000).toFixed(viewers % 1000 === 0 ? 0 : 1)}k` : `${viewers}`;
}

function safeStr(v: string | null | undefined, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function getStreamTypeBadge(room: LiveNowRoom): string {
  if (room.formatBadge === "Auction") return "Auction";
  if (room.roomKind === "break_room") return "Break";
  if (room.formatBadge === "Buy Now") return "Buy";
  const title = safeStr(room.title).toLowerCase();
  if (title.includes("replay") || title.includes("hit")) return "Replay";
  return "Sale";
}

export function getSignalScore(room: LiveNowRoom): number {
  let score = room.status === "live_now" ? 200 : 0;
  score += Math.min(room.viewers, 3000) / 12;

  if (room.roomKind === "break_room") {
    const left = firstInt(safeStr(room.progressLabel).split("/")[0]);
    const moved = firstInt(safeStr(room.activityLine));
    score += moved * 6;
    if (left > 0 && left <= 5) score += 40;
  } else {
    const queued = firstInt(safeStr(room.queueLine));
    const bid = firstInt(safeStr(room.priceLine));
    score += queued * 5 + Math.min(bid, 5000) / 75;
    if (room.formatBadge === "Auction") score += 35;
  }

  return score;
}

export function getLiveCardSignals(room: LiveNowRoom): LiveCardSignals {
  const isAuction = room.formatBadge === "Auction";
  const isBreak = room.roomKind === "break_room";
  const titleLower = safeStr(room.title).toLowerCase();
  const isReplay = titleLower.includes("replay") || titleLower.includes("hit");
  const isBuySale = !isBreak && !isAuction && !isReplay;

  if (room.status === "scheduled") {
    return {
      primary: room.scheduledFor ? `Starts ${room.scheduledFor}` : "Upcoming stream",
      secondary: isBreak ? safeStr(room.progressLabel) : isAuction ? "Bid queue opens at start" : safeStr(room.queueLine),
    };
  }

  // 1) Active auction bid
  if (isAuction) {
    const pl = safeStr(room.priceLine, "Bids live in room");
    return {
      primary: pl.replace(/^Top bids?/i, "Current bid"),
      secondary:
        room.roomKind === "live_sale_room"
          ? safeStr(room.queueLine) || "High activity"
          : safeStr(room.activityLine) || "High activity",
    };
  }

  // 2) Spots nearly full (break)
  if (isBreak) {
    const left = firstInt(safeStr(room.progressLabel));
    if (left > 0 && left <= 5) {
      return {
        primary: `${left} spots left`,
        secondary: safeStr(room.priceLine, "Watch live for pricing"),
      };
    }
  }

  // 3) Low inventory (buy/sale)
  if (isBuySale) {
    const queued = firstInt(safeStr(room.queueLine));
    if (queued > 0 && queued <= 5) {
      return {
        primary: `Low inventory · ${queued} items left`,
        secondary: safeStr(room.priceLine, "Buy now from seller"),
      };
    }
  }

  // 4) Recent sale or big hit
  if (isBreak && safeStr(room.activityLine).toLowerCase().includes("hit")) {
    return {
      primary: "Big hit just pulled",
      secondary: safeStr(room.activityLine),
    };
  }
  if (isBuySale) {
    const soldAgo = 6 + (room.viewers % 37);
    return {
      primary: `Sold ${soldAgo}s ago`,
      secondary: safeStr(room.queueLine),
    };
  }

  // 5) Viewer velocity / trending
  if (room.viewers >= 1500) {
    return {
      primary: `Trending · ${compactViewers(room.viewers)} watching`,
      secondary: isBreak ? safeStr(room.activityLine) : isAuction ? "Bid activity live now" : safeStr(room.queueLine),
    };
  }

  // 6) Just started
  if (room.viewers <= 420) {
    return {
      primary: "Just started",
      secondary: isBreak ? safeStr(room.priceLine) : isAuction ? "Bid live now" : "Fresh inventory",
    };
  }

  // 7) Viewer count fallback
  return {
    primary: `${compactViewers(room.viewers)} watching`,
    secondary: isBreak ? safeStr(room.priceLine) : isAuction ? "Active bids" : safeStr(room.queueLine) || "Chat active",
  };
}
