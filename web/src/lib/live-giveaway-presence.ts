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
