import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import { VIEWER_EVENT_JOIN_BODY, VIEWER_JOIN_DEDUPE_WINDOW_MS } from "@/lib/live-room-viewer-events";

const JOIN_COOLDOWN_MS = VIEWER_JOIN_DEDUPE_WINDOW_MS;
const joinInFlightByRoom = new Map<string, Promise<LiveRoomMessageDTO | null>>();

function joinCooldownKey(roomId: string): string {
  return `gv:live-room-join:${roomId}`;
}

export function buildOptimisticViewerJoinMessage(args: {
  roomId: string;
  userId: string;
  username: string;
}): LiveRoomMessageDTO {
  return {
    id: `pending:join:${args.roomId}`,
    liveRoomId: args.roomId,
    senderId: args.userId,
    senderUsername: args.username,
    senderAvatarUrl: null,
    body: VIEWER_EVENT_JOIN_BODY,
    messageType: "system",
    createdAt: new Date().toISOString(),
    mentions: [],
  };
}

/** Persisted join announcement with 30s client cooldown (matches server dedupe). */
export async function announceLiveRoomJoin(roomId: string): Promise<LiveRoomMessageDTO | null> {
  if (typeof window === "undefined") return null;

  const inFlight = joinInFlightByRoom.get(roomId);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    const key = joinCooldownKey(roomId);
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < JOIN_COOLDOWN_MS) return null;

    sessionStorage.setItem(key, String(Date.now()));

    const res = await fetch(`/api/live-rooms/${encodeURIComponent(roomId)}/viewer-event`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "join" }),
    });
    if (!res.ok) {
      sessionStorage.removeItem(key);
      return null;
    }
    const j = (await res.json()) as { message?: LiveRoomMessageDTO };
    return j.message?.id ? j.message : null;
  })();

  joinInFlightByRoom.set(roomId, task);
  try {
    return await task;
  } finally {
    if (joinInFlightByRoom.get(roomId) === task) {
      joinInFlightByRoom.delete(roomId);
    }
  }
}

/** Pause open-entry giveaway rows when the viewer leaves the live room. */
export function announceLiveRoomLeave(roomId: string): void {
  if (typeof window === "undefined") return;
  const url = `/api/live-rooms/${encodeURIComponent(roomId)}/viewer-event`;
  const body = JSON.stringify({ kind: "leave" });
  void fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* best-effort on tab close / navigation */
  });
}
