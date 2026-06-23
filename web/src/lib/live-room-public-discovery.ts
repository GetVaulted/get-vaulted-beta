/** Whether a room should appear in buyer-facing live discovery lists. */
export function isPublicDiscoveryLiveRoom(row: {
  status: string;
  scheduledStartAt?: string | Date | null;
}): boolean {
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
