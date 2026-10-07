import type { LiveRoomMessageType } from "@/generated/prisma/client";
import { getLiveRoomModeratorContext } from "@/lib/trust/live-room-moderation";
import { createTtlCache } from "@/lib/ttl-cache";

export function isStaffLiveRoomMessageType(
  messageType: LiveRoomMessageType | string | null | undefined,
): boolean {
  return messageType === "staff";
}

/** Host or assigned moderator may send/see staff chat. */
export async function viewerCanAccessStaffChat(args: {
  liveRoomId: string;
  userId: string | null | undefined;
}): Promise<boolean> {
  if (!args.userId) return false;
  const ctx = await getLiveRoomModeratorContext({
    liveRoomId: args.liveRoomId,
    userId: args.userId,
  });
  return ctx.isHost || ctx.isModerator;
}

const STAFF_ACCESS_CACHE_MS = 15_000;
const staffAccessCache = createTtlCache<boolean>();

/**
 * Same answer as {@link viewerCanAccessStaffChat}, reused for a few seconds per server instance.
 * Used on endpoints every viewer polls; host/moderator assignment changes show up within the TTL.
 */
export async function viewerCanAccessStaffChatCached(args: {
  liveRoomId: string;
  userId: string | null | undefined;
}): Promise<boolean> {
  if (!args.userId) return false;
  return staffAccessCache.get(`${args.liveRoomId}:${args.userId}`, STAFF_ACCESS_CACHE_MS, () =>
    viewerCanAccessStaffChat(args),
  );
}

export function filterStaffMessagesForViewer<T extends { messageType: string }>(
  messages: T[],
  canSeeStaff: boolean,
): T[] {
  if (canSeeStaff) return messages;
  return messages.filter((m) => !isStaffLiveRoomMessageType(m.messageType));
}
