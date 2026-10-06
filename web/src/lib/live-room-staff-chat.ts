import type { LiveRoomMessageType } from "@/generated/prisma/client";
import { getLiveRoomModeratorContext } from "@/lib/trust/live-room-moderation";

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

export function filterStaffMessagesForViewer<T extends { messageType: string }>(
  messages: T[],
  canSeeStaff: boolean,
): T[] {
  if (canSeeStaff) return messages;
  return messages.filter((m) => !isStaffLiveRoomMessageType(m.messageType));
}
