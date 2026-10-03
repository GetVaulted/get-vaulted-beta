import { dedupeViewerJoinChatMessages } from "@/lib/dedupe-viewer-join-messages";
import { LIVE_ROOM_CHAT_HISTORY_MAX } from "@/lib/live-room-chat-policy";
import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";

function capChatHistory(messages: LiveRoomMessageDTO[]): LiveRoomMessageDTO[] {
  if (messages.length <= LIVE_ROOM_CHAT_HISTORY_MAX) return messages;
  return messages.slice(-LIVE_ROOM_CHAT_HISTORY_MAX);
}

const PENDING_ID_PREFIX = "pending:";

function isPending(message: LiveRoomMessageDTO): boolean {
  return message.id.startsWith(PENDING_ID_PREFIX);
}

/**
 * Deterministic chat ordering across every device: sort by server `createdAt`, then break ties on
 * the message id. Without the id tiebreaker two messages sharing a millisecond timestamp keep
 * whatever arrival order a given device happened to merge them in, so buyers saw messages in
 * different orders ("seeing them on other devices before some"). Mobile already sorts this way.
 */
function sortChatMessages(messages: LiveRoomMessageDTO[]): LiveRoomMessageDTO[] {
  return [...messages].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Drop optimistic `pending:*` rows once their real (server-persisted) counterpart arrives. The
 * sender appends a `pending:<ts>` row immediately; the realtime broadcast (or a poll) later brings
 * the same message back with its real cuid. Matching on sender + trimmed body lets us remove the
 * optimistic twin so the author does not see their own message twice. Mirrors mobile's
 * `stripMatchingPendingMessages`.
 */
function stripReconciledPending(
  prev: LiveRoomMessageDTO[],
  incoming: LiveRoomMessageDTO[],
): LiveRoomMessageDTO[] {
  const real = incoming.filter((m) => !isPending(m));
  if (real.length === 0) return prev;
  return prev.filter((m) => {
    if (!isPending(m)) return true;
    return !real.some(
      (r) => r.senderId === m.senderId && r.body.trim() === m.body.trim(),
    );
  });
}

export function mergeLiveRoomMessagesById(
  prev: LiveRoomMessageDTO[],
  incoming: LiveRoomMessageDTO[],
): LiveRoomMessageDTO[] {
  const map = new Map<string, LiveRoomMessageDTO>();
  for (const m of stripReconciledPending(prev, incoming)) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return capChatHistory(dedupeViewerJoinChatMessages(sortChatMessages([...map.values()])));
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
  const base = stripReconciledPending(prev, [normalized]);
  return capChatHistory(
    dedupeViewerJoinChatMessages(sortChatMessages([...base, normalized])),
  );
}
