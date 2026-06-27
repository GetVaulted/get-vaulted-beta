import type { LiveNowFilter, LiveNowRoom, LiveRoomFormatBadge, LiveRoomKind, LiveShowStatus, VaultBreakCategory } from "@/content/live-rooms";

const CATEGORIES: Exclude<LiveNowFilter, "All">[] = [
  "Breaks",
  "Trading Cards",
  "Memorabilia",
  "Watches",
  "Sneakers",
  "Other",
];

function parseVaultBreakCategory(raw: string): VaultBreakCategory | undefined {
  const t = raw.trim();
  if (t === "Cards" || t === "Helmets") return t;
  return undefined;
}

function normalizeCategory(raw: string): Exclude<LiveNowFilter, "All"> {
  const t = raw.trim();
  if (parseVaultBreakCategory(t)) return "Breaks";
  if (CATEGORIES.includes(t as Exclude<LiveNowFilter, "All">)) return t as Exclude<LiveNowFilter, "All">;
  return "Other";
}

export type LiveRoomListApiRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  roomType: "auction" | "sale" | "break";
  status: "scheduled" | "live" | "ended";
  thumbnailUrl: string;
  viewerCount: number;
  scheduledStartAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  sellerUsername: string;
  itemCount: number;
  activeItemTitle: string | null;
  teamBoardLeague: "nfl" | "nba" | "mlb";
  tipRecipientMode?: "host" | "moderator";
  tipModeratorId?: string | null;
  tipModeratorUsername?: string | null;
  tipsToModerator?: boolean;
};

function roomKindAndBadge(roomType: LiveRoomListApiRow["roomType"]): { roomKind: LiveRoomKind; formatBadge: LiveRoomFormatBadge } {
  if (roomType === "break") return { roomKind: "break_room", formatBadge: "PYT Break" };
  if (roomType === "auction") return { roomKind: "live_sale_room", formatBadge: "Auction" };
  return { roomKind: "live_sale_room", formatBadge: "Live Sale" };
}

function formatSchedule(iso: string | null): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return undefined;
  }
}

/** Map API list row to legacy card + signals shape */
export function mapApiRowToLiveNowRoom(row: LiveRoomListApiRow): LiveNowRoom {
  const breakVaultCategory = parseVaultBreakCategory(row.category);
  const category = normalizeCategory(row.category);
  const { roomKind, formatBadge } = roomKindAndBadge(row.roomType);
  const showStatus: LiveShowStatus = row.status === "live" ? "live_now" : "scheduled";
  const scheduledFor =
    row.status === "scheduled" && row.scheduledStartAt
      ? formatSchedule(row.scheduledStartAt) ?? "Upcoming"
      : undefined;
  const imageSeed = row.thumbnailUrl?.trim() ? `live-thumb-${row.id}` : `live-db-${row.id}`;

  if (roomKind === "break_room") {
    return {
      id: row.id,
      title: row.title,
      roomKind: "break_room",
      formatBadge,
      category,
      breakVaultCategory,
      status: showStatus,
      scheduledFor,
      viewers: row.viewerCount,
      imageSeed,
      thumbnailUrl: row.thumbnailUrl?.trim() || undefined,
      urgencyLine:
        showStatus === "scheduled"
          ? `Starts ${scheduledFor ?? "soon"}`
          : row.activeItemTitle
            ? `Now: ${row.activeItemTitle}`
            : "Live break in progress",
      progressLabel:
        row.itemCount > 0 ? `${row.itemCount} spot slot${row.itemCount === 1 ? "" : "s"} in this break` : "Spots open",
      priceLine: "Watch live for spot pricing",
      activityLine: (row.description ?? "").trim().slice(0, 80) || "Chat open — join the room",
      href: `/live/${encodeURIComponent(row.id)}`,
      sellerShopUsername: row.sellerUsername,
    };
  }

  const queueLine = `${row.itemCount} item${row.itemCount === 1 ? "" : "s"} in queue`;
  const currentItem = row.activeItemTitle ?? (row.itemCount ? "On deck" : "Queue loading");

  return {
    id: row.id,
    title: row.title,
    roomKind: "live_sale_room",
    formatBadge,
    category,
    status: showStatus,
    scheduledFor,
    viewers: row.viewerCount,
    imageSeed,
    thumbnailUrl: row.thumbnailUrl?.trim() || undefined,
    urgencyLine: showStatus === "scheduled" ? `Starts ${scheduledFor ?? "soon"}` : "Live sale in progress",
    currentItem,
    priceLine: formatBadge === "Auction" ? "Top bids live in room" : "Buy now from seller",
    queueLine,
    href: `/live/${encodeURIComponent(row.id)}`,
    sellerShopUsername: row.sellerUsername,
  };
}
