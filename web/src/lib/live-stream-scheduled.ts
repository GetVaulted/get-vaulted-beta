/** Three-hour window before showtime where we show a live countdown instead of static date copy. */
export const SCHEDULED_PRESHOW_WINDOW_MS = 3 * 60 * 60 * 1000;

export type ScheduledPrereleasePhase = "far" | "countdown" | "post_start" | "no_schedule" | "not_applicable";

export function parseScheduledStartMs(iso: string | null | undefined): number | null {
  if (iso == null || typeof iso !== "string" || !iso.trim()) return null;
  const t = Date.parse(iso.trim());
  return Number.isFinite(t) ? t : null;
}

/**
 * When `roomLifecycleLive` is true, the room is already "live" in the app — countdown copy does not apply.
 */
export function resolveScheduledPrereleasePhase(
  nowMs: number,
  scheduledStartMs: number | null,
  roomLifecycleLive: boolean,
): ScheduledPrereleasePhase {
  if (roomLifecycleLive) return "not_applicable";
  if (scheduledStartMs == null) return "no_schedule";
  const delta = scheduledStartMs - nowMs;
  if (delta > SCHEDULED_PRESHOW_WINDOW_MS) return "far";
  if (delta > 0) return "countdown";
  return "post_start";
}

export function formatScheduledStartLong(iso: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export type CountdownParts = { hours: number; minutes: number; seconds: number };

/** Remaining time until `targetMs`; non-negative. */
export function getCountdownParts(nowMs: number, targetMs: number): CountdownParts {
  const ms = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { hours, minutes, seconds };
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
