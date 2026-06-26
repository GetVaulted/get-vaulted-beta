import { prisma } from "@/lib/prisma";
import { emitLiveRoomMessageById } from "@/lib/realtime-emit-server";

export const HOST_ENDING_LIVE_BODY = "Host is ending the live.";

export function isHostEndingLiveBody(text: string): boolean {
  return text.trim() === HOST_ENDING_LIVE_BODY;
}

/** Surfaces in buyer chat + realtime when the host ends the show. */
export async function postHostEndingLiveChatMessage(liveRoomId: string, hostUserId: string): Promise<void> {
  const row = await prisma.liveRoomMessage.create({
    data: {
      liveRoomId,
      senderId: hostUserId,
      body: HOST_ENDING_LIVE_BODY,
      messageType: "system",
    },
  });
  void emitLiveRoomMessageById(row.id);
}
