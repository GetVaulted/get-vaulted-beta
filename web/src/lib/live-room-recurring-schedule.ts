/** Maximum horizon for recurring vault events from the first scheduled slot. */
export const LIVE_ROOM_RECURRING_MAX_DAYS = 30;

/** Weekly recurrence interval between shows. */
export const LIVE_ROOM_RECURRING_INTERVAL_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Build weekly recurring start times from the first slot through 30 days. */
export function buildWeeklyRecurringScheduleDates(firstStart: Date, now = new Date()): Date[] {
  if (Number.isNaN(firstStart.getTime())) return [];
  const dates: Date[] = [];
  const maxMs = firstStart.getTime() + LIVE_ROOM_RECURRING_MAX_DAYS * MS_PER_DAY;
  let cursor = new Date(firstStart.getTime());
  while (cursor.getTime() <= maxMs) {
    if (cursor.getTime() >= now.getTime() - 60_000) {
      dates.push(new Date(cursor));
    }
    cursor = new Date(cursor.getTime() + LIVE_ROOM_RECURRING_INTERVAL_DAYS * MS_PER_DAY);
  }
  return dates;
}
