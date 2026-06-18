/** Default entry window for open and buyers giveaways (5 minutes). */
export const LIVE_GIVEAWAY_DEFAULT_ENTRY_DURATION_MS = 5 * 60 * 1000;

export function scheduledGiveawayEntryCloseAt(openAt: Date = new Date()): Date {
  return new Date(openAt.getTime() + LIVE_GIVEAWAY_DEFAULT_ENTRY_DURATION_MS);
}

export function giveawaySecondsRemaining(
  entryCloseAt: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!entryCloseAt) return null;
  const end = Date.parse(entryCloseAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

export function formatGiveawayCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
