import type { ChatMessage } from '../types';

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

export function tailUniqueChatMessages(messages: ChatMessage[], max: number): ChatMessage[] {
  return dedupeChatMessagesById(messages).slice(-max);
}
