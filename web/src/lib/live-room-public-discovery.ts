export type LiveRoomDiscoveryVisibility = "public" | "private";

/** Parse create/update payload for show visibility. Defaults to public. */
export function parseLiveRoomDiscoveryVisibility(input: {
  discoveryVisibility?: string | null;
  visibility?: string | null;
  isPrivate?: boolean | null;
}): LiveRoomDiscoveryVisibility {
  if (input.isPrivate === true) return "private";
  const raw = (input.discoveryVisibility ?? input.visibility ?? "public").trim().toLowerCase();
  return raw === "private" ? "private" : "public";
}

/** Whether a room should appear in buyer-facing live discovery lists. */
export function isPublicDiscoveryLiveRoom(row: {
  status: string;
  scheduledStartAt?: string | Date | null;
  discoveryVisibility?: string | null;
  visibility?: string | null;
  isPrivate?: boolean | null;
}): boolean {
  if (parseLiveRoomDiscoveryVisibility(row) === "private") return false;
  if (row.status === "live") return true;
  if (row.status === "scheduled") {
    const raw = row.scheduledStartAt;
    // Go-live-now rooms may omit a future schedule until the host is on air.
    if (raw == null) return true;
    if (raw instanceof Date) return !Number.isNaN(raw.getTime());
    return Boolean(String(raw).trim());
  }
  return false;
}
