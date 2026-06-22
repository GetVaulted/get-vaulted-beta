import type { LiveRoomStatus } from "@/generated/prisma/client";

/** Max chat rows kept client-side and returned by GET /messages (newest window). */
export const LIVE_ROOM_CHAT_HISTORY_MAX = 300;

/** Published shows in the live section accept chat before and during the stream. */
export function liveRoomChatOpen(status: LiveRoomStatus | string | null | undefined): boolean {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : status;
  return normalized === "live" || normalized === "scheduled";
}
