export const liveNowFilters = [
  "All",
  "Breaks",
  "Trading Cards",
  "Memorabilia",
  "Watches",
  "Sneakers",
  "Other",
] as const;

export type LiveNowFilter = (typeof liveNowFilters)[number];
export type LiveRoomKind = "break_room" | "live_sale_room";
export type LiveRoomFormatBadge = "PYT Break" | "Random Break" | "Live Sale" | "Auction" | "Buy Now";
export type LiveShowStatus = "live_now" | "scheduled";
export type VaultBreakCategory = "Cards" | "Helmets";

type LiveNowRoomBase = {
  id: string;
  title: string;
  roomKind: LiveRoomKind;
  formatBadge: LiveRoomFormatBadge;
  category: Exclude<LiveNowFilter, "All">;
  /** When set, break tiles show "Break - Cards" / "Break - Helmets". */
  breakVaultCategory?: VaultBreakCategory;
  status: LiveShowStatus;
  scheduledFor?: string;
  /** ISO start time for sorting (matches mobile `scheduledStartAtIso`). */
  scheduledStartAtIso?: string | null;
  viewers: number;
  imageSeed: string;
  /** When set (e.g. DB-backed room), card uses this image instead of placeholder seed. */
  thumbnailUrl?: string;
  urgencyLine: string;
  href: string;
  /** Host shop on `/seller/[username]` (matches marketplace-style usernames). */
  sellerShopUsername?: string;
};

export type LiveNowBreakRoom = LiveNowRoomBase & {
  roomKind: "break_room";
  progressLabel: string;
  priceLine: string;
  activityLine: string;
};

export type LiveNowSaleRoom = LiveNowRoomBase & {
  roomKind: "live_sale_room";
  currentItem: string;
  priceLine: string;
  queueLine: string;
};

export type LiveNowRoom = LiveNowBreakRoom | LiveNowSaleRoom;

/** Populated only from `GET /api/live-rooms` in UI; kept empty here so production never ships fabricated rooms. */
export const liveShows: LiveNowRoom[] = [];

export const liveNowRooms: LiveNowRoom[] = [];

export type LiveRoomCatalogEntry = {
  id: string;
  roomKind: LiveRoomKind;
  title: string;
  description: string;
  sellerShopUsername?: string;
};

export const liveRoomCatalog: Record<string, LiveRoomCatalogEntry> = {};
