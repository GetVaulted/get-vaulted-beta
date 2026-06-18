import type { ChatMessage } from '../types';

/** System bodies persisted by POST /api/live-rooms/:id/viewer-event */
export const VIEWER_EVENT_JOIN_BODY = 'joined 🔥';
export const VIEWER_EVENT_JOIN_BODY_LEGACY = 'joined 👋';
export const VIEWER_EVENT_SHARE_BODY = 'shared this show ✉️';

export function isJoinEventBody(text: string): boolean {
  return text === VIEWER_EVENT_JOIN_BODY || text === VIEWER_EVENT_JOIN_BODY_LEGACY;
}

/** Preserve first-seen order; drop duplicate ids from repeated pool entries. */
export function dedupeChatMessagesById(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function isViewerEventMessage(m: ChatMessage): boolean {
  if (m.messageType !== 'system') return false;
  return isJoinEventBody(m.text) || m.text === VIEWER_EVENT_SHARE_BODY;
}

/** Collapse duplicate join/share lines in the visible window. */
export function dedupeViewerEventMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!isViewerEventMessage(m)) {
      out.push(m);
      continue;
    }
    const key = isJoinEventBody(m.text)
      ? `join:${m.user.trim().toLowerCase()}`
      : `${m.text}:${m.user.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export function tailUniqueChatMessages(messages: ChatMessage[], max: number): ChatMessage[] {
  return dedupeViewerEventMessages(dedupeChatMessagesById(messages)).slice(-max);
}

/** Full deduped history for scrollable overlay (newest last). */
export function prepareChatMessageHistory(messages: ChatMessage[]): ChatMessage[] {
  return sortChatMessagesByTime(dedupeViewerEventMessages(dedupeChatMessagesById(messages)));
}

export function sortChatMessagesByTime(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

export function mergeChatMessagesById(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return sortChatMessagesByTime([...byId.values()]).slice(-80);
}

/** Client-side cooldown before re-announcing a room join (leave + return). */
export const JOIN_ANNOUNCE_COOLDOWN_MS = 30_000;

export function formatChatDisplayName(user: string): string {
  const trimmed = user.trim();
  if (!trimmed) return 'Guest';
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

export function formatViewerEventName(user: string): string {
  const trimmed = user.trim();
  if (!trimmed) return 'Guest';
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}
