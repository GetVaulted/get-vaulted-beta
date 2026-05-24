import type { ChatMessage } from '../types';

/** System bodies persisted by POST /api/live-rooms/:id/viewer-event */
export const VIEWER_EVENT_JOIN_BODY = 'joined 👋';
export const VIEWER_EVENT_SHARE_BODY = 'shared this show ✉️';

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
  return m.text === VIEWER_EVENT_JOIN_BODY || m.text === VIEWER_EVENT_SHARE_BODY;
}

/** Keep one join/share line per username in the visible feed. */
export function dedupeViewerEventMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!isViewerEventMessage(m)) {
      out.push(m);
      continue;
    }
    const key = `${m.text}:${m.user.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export function tailUniqueChatMessages(messages: ChatMessage[], max: number): ChatMessage[] {
  return dedupeViewerEventMessages(dedupeChatMessagesById(messages)).slice(-max);
}

export function formatChatDisplayName(user: string, isHost?: boolean): string {
  if (isHost) return 'HOST';
  const trimmed = user.trim();
  if (!trimmed) return 'Guest';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

export function formatViewerEventName(user: string): string {
  const trimmed = user.trim();
  if (!trimmed) return 'Guest';
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}
