/** Calendar day `YYYY-MM-DD` → half-open UTC interval `[start, end)` in `timeZone`. */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 80) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Instant when the given wall-clock time occurs in `timeZone`.
 * Iteratively corrects UTC guess using Intl parts (handles DST).
 */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  let instant = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const actual = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const delta = actual - desired;
    if (delta === 0) break;
    instant -= delta;
  }
  return new Date(instant);
}

export function addCalendarDays(day: string, deltaDays: number): string {
  if (!DAY_RE.test(day)) throw new Error("INVALID_DAY");
  const [y, m, d] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function calendarDayBoundsUtc(
  day: string,
  timeZone: string,
): { start: Date; end: Date } {
  if (!DAY_RE.test(day)) throw new Error("INVALID_DAY");
  if (!isValidIanaTimeZone(timeZone)) throw new Error("INVALID_TZ");

  const [y, m, d] = day.split("-").map(Number);
  const start = zonedLocalToUtc(y, m, d, 0, 0, 0, timeZone);
  const next = addCalendarDays(day, 1);
  const [ny, nm, nd] = next.split("-").map(Number);
  const end = zonedLocalToUtc(ny, nm, nd, 0, 0, 0, timeZone);
  return { start, end };
}

/** Local calendar day string for `instant` in `timeZone`. */
export function calendarDayInTimeZone(instant: Date, timeZone: string): string {
  if (!isValidIanaTimeZone(timeZone)) throw new Error("INVALID_TZ");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}`;
}
