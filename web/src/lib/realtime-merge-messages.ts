import { dedupeViewerJoinChatMessages } from "@/lib/dedupe-viewer-join-messages";
import { LIVE_ROOM_CHAT_HISTORY_MAX } from "@/lib/live-room-chat-policy";
import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";

function capChatHistory(messages: LiveRoomMessageDTO[]): LiveRoomMessageDTO[] {
  if (messages.length <= LIVE_ROOM_CHAT_HISTORY_MAX) return messages;
  return messages.slice(-LIVE_ROOM_CHAT_HISTORY_MAX);
}

export function mergeLiveRoomMessagesById(
  prev: LiveRoomMessageDTO[],
  incoming: LiveRoomMessageDTO[],
): LiveRoomMessageDTO[] {
  const map = new Map<string, LiveRoomMessageDTO>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return capChatHistory(
    dedupeViewerJoinChatMessages(
      [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ),
  );
}

export function appendLiveRoomMessageDedupe(
  prev: LiveRoomMessageDTO[],
  next: LiveRoomMessageDTO,
): LiveRoomMessageDTO[] {
  if (prev.some((m) => m.id === next.id)) return prev;
  const createdAt =
    next.createdAt?.trim() ||
    prev.find((m) => m.id === next.id)?.createdAt ||
    new Date().toISOString();
  const normalized = createdAt === next.createdAt ? next : { ...next, createdAt };
  return capChatHistory(
    dedupeViewerJoinChatMessages(
      [...prev, normalized].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ),
  );
}
