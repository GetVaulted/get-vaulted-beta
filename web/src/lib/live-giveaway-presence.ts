import type { LiveGiveawayEntryMethod } from "@/generated/prisma/client";

/** Only manual watch-enter rows pause when the viewer leaves the live room. */
export function isWatchEnterGiveawayMethod(method: LiveGiveawayEntryMethod | string): boolean {
  return method === "watch_enter";
}

export function isGiveawayEntryEligibleForDraw(entry: {
  method: LiveGiveawayEntryMethod | string;
  activeInRoom: boolean;
}): boolean {
  if (isWatchEnterGiveawayMethod(entry.method)) return entry.activeInRoom;
  return true;
}

/**
 * A "left the room" notice arriving this soon after the viewer was last confirmed present is not trusted.
 * The app can fire "left" and "joined" at nearly the same moment (e.g. right after tapping Enter), and the
 * two requests are not ordered — a late "left" used to knock a viewer who never left out of the draw pool.
 */
export const GIVEAWAY_LEAVE_GRACE_MS = 8_000;

export function shouldIgnoreLeaveNotice(presenceAt: Date | null | undefined, now: Date): boolean {
  if (!presenceAt) return false;
  const age = now.getTime() - presenceAt.getTime();
  return age >= 0 && age < GIVEAWAY_LEAVE_GRACE_MS;
}
