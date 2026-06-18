import type { LiveRoomStatus } from "@/generated/prisma/client";

/** Published shows in the live section accept chat before and during the stream. */
export function liveRoomChatOpen(status: LiveRoomStatus | string | null | undefined): boolean {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : status;
  return normalized === "live" || normalized === "scheduled";
}
