/** Short relative label for browse cards and listing badges (not a live clock). */
export function formatAuctionTimeRemaining(endsAtIso: string, nowMs = Date.now()): string {
  const end = new Date(endsAtIso).getTime();
  if (!Number.isFinite(end)) return "";
  const ms = end - nowMs;
  if (ms <= 0) return "Ended";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m left`;
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 48) return `${hours}h left`;
  const days = Math.ceil(ms / 86_400_000);
  return `${days}d left`;
}
