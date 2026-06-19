import type { LiveRoomMessageDTO } from "@/lib/live-room-serialize";
import {
  VIEWER_EVENT_JOIN_BODY,
  VIEWER_EVENT_JOIN_BODY_LEGACY,
  VIEWER_JOIN_DEDUPE_WINDOW_MS,
} from "@/lib/live-room-viewer-events";

export { VIEWER_JOIN_DEDUPE_WINDOW_MS };

const JOIN_BODIES = new Set([VIEWER_EVENT_JOIN_BODY, VIEWER_EVENT_JOIN_BODY_LEGACY]);

export function isViewerJoinChatBody(body: string | null | undefined): boolean {
  const text = body?.trim();
  return Boolean(text && JOIN_BODIES.has(text));
}

/** Collapse spammy duplicate "username joined" system rows (same sender, same join body, within window). */
export function dedupeViewerJoinChatMessages(messages: LiveRoomMessageDTO[]): LiveRoomMessageDTO[] {
  const lastJoinAtBySender = new Map<string, number>();
  const out: LiveRoomMessageDTO[] = [];

  for (const m of messages) {
    if (m.messageType !== "system" || !isViewerJoinChatBody(m.body)) {
      out.push(m);
      continue;
    }
    const senderKey = m.senderId?.trim() || m.senderUsername?.trim().toLowerCase() || m.id;
    const createdAtMs = Date.parse(m.createdAt);
    const lastMs = lastJoinAtBySender.get(senderKey);
    if (
      lastMs != null &&
      Number.isFinite(createdAtMs) &&
      createdAtMs - lastMs < VIEWER_JOIN_DEDUPE_WINDOW_MS
    ) {
      continue;
    }
    if (Number.isFinite(createdAtMs)) {
      lastJoinAtBySender.set(senderKey, createdAtMs);
    }
    out.push(m);
  }

  return out;
}
