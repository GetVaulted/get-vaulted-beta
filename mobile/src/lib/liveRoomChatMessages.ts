import type { ChatMessage } from '../types';

/** Max chat rows kept client-side (newest window) — aligned with web GET /messages. */
export const LIVE_ROOM_CHAT_HISTORY_MAX = 300;

/** System bodies persisted by POST /api/live-rooms/:id/viewer-event */
export const VIEWER_EVENT_JOIN_BODY = 'joined 🔥';
export const VIEWER_EVENT_JOIN_BODY_LEGACY = 'joined 👋';
export const VIEWER_EVENT_SHARE_BODY = 'shared this show ✉️';
export const HOST_ENDING_LIVE_BODY = 'Host is ending the live.';

export function isHostEndingLiveBody(text: string): boolean {
  return text.trim() === HOST_ENDING_LIVE_BODY;
}

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
  return isJoinEventBody(m.text) || m.text === VIEWER_EVENT_SHARE_BODY || isHostEndingLiveBody(m.text);
}

/** Collapse duplicate join/share lines (keeps the newest per user, sorted in time with chat). */
export function dedupeViewerEventMessages(messages: ChatMessage[]): ChatMessage[] {
  const sorted = sortChatMessagesByTime(messages);
  const latestJoinByUser = new Map<string, ChatMessage>();
  const latestShareByUser = new Map<string, ChatMessage>();
  const chatRows: ChatMessage[] = [];

  for (const m of sorted) {
    if (!isViewerEventMessage(m)) {
      chatRows.push(m);
      continue;
    }
    const userKey = m.user.trim().toLowerCase() || m.id;
    if (isJoinEventBody(m.text)) {
      latestJoinByUser.set(userKey, m);
    } else {
      latestShareByUser.set(userKey, m);
    }
  }

  return sortChatMessagesByTime([
    ...chatRows,
    ...latestJoinByUser.values(),
    ...latestShareByUser.values(),
  ]);
}

export function tailUniqueChatMessages(messages: ChatMessage[], max: number): ChatMessage[] {
  return dedupeViewerEventMessages(dedupeChatMessagesById(messages)).slice(-max);
}

/** Full deduped history for scrollable overlay (newest last). */
export function prepareChatMessageHistory(messages: ChatMessage[]): ChatMessage[] {
  const withoutHostEnding = messages.filter(
    (m) => !(m.messageType === 'system' && isHostEndingLiveBody(m.text)),
  );
  return sortChatMessagesByTime(dedupeViewerEventMessages(dedupeChatMessagesById(withoutHostEnding)));
}

/** Chronological window for bottom-anchored live chat (oldest → newest). */
export function prepareFloatingChatDisplay(messages: ChatMessage[], maxVisible = LIVE_ROOM_CHAT_HISTORY_MAX): ChatMessage[] {
  const history = prepareChatMessageHistory(messages);
  if (history.length <= maxVisible) return history;
  return history.slice(-maxVisible);
}

export function sortChatMessagesByTime(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function messageTimeMs(m: ChatMessage): number {
  if (!m.createdAt) return 0;
  const parsed = Date.parse(m.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeChatMessagesById(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) {
    const prior = byId.get(m.id);
    if (prior && messageTimeMs(m) === 0 && messageTimeMs(prior) > 0) {
      byId.set(m.id, { ...m, createdAt: prior.createdAt });
    } else {
      byId.set(m.id, m);
    }
  }
  return sortChatMessagesByTime([...byId.values()]).slice(-LIVE_ROOM_CHAT_HISTORY_MAX);
}

/** Client-side cooldown before re-announcing a room join (leave + return). */
export const JOIN_ANNOUNCE_COOLDOWN_MS = 30_000;

export function formatChatDisplayName(user: string): string {
  const trimmed = user.trim();
  if (!trimmed) return 'Guest';
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

/** Clipboard-friendly line for moderators reviewing or escalating chat. */
export function formatChatMessageForCopy(username: string, text: string): string {
  const handle = formatChatDisplayName(username);
  const body = text.trim();
  return body ? `@${handle}: ${body}` : `@${handle}`;
}

export function formatViewerEventName(user: string): string {
  const trimmed = user.trim();
  if (!trimmed) return 'Guest';
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}
