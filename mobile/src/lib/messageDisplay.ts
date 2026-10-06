import type { ThreadMessage } from '../types/messages';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Messages from the same person this close together read as one group of bubbles. */
export const MESSAGE_GROUP_GAP_MS = 5 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Inbox row time: clock time today, "Yesterday", weekday this week, otherwise "Oct 1". */
export function formatInboxTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (sameDay(d, now)) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Day separator inside a conversation. */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (sameDay(d, now)) return 'Today';
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (days === 1) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Photo-only messages arrive from the server as "📷 Photo"; show plain text in the inbox. */
export function inboxPreviewText(preview: string | null | undefined): string {
  const t = (preview ?? '').replace(/^📷\s*/, '').trim();
  return t || '';
}

export type ThreadListRow =
  | { type: 'day'; key: string; label: string }
  | {
      type: 'message';
      key: string;
      message: ThreadMessage;
      isMine: boolean;
      /** First bubble of a run from one person (extra space above, round top corner). */
      firstInGroup: boolean;
      /** Last bubble of a run (square tail corner, shows the time). */
      lastInGroup: boolean;
      timeLabel: string | null;
      /** Only the most recent message you sent shows "Sent" / "Read". */
      showStatus: boolean;
    };

/** Turns the flat message list into rows with day separators and grouping for the chat list. */
export function buildThreadRows(
  messages: ThreadMessage[],
  myUserId: string,
  now: Date = new Date(),
): ThreadListRow[] {
  const rows: ThreadListRow[] = [];
  let lastDay: number | null = null;
  const joined = (a: ThreadMessage | undefined, b: ThreadMessage | undefined): boolean => {
    if (!a || !b) return false;
    if (a.kind === 'system' || b.kind === 'system') return false;
    if (a.senderId !== b.senderId) return false;
    const ta = new Date(a.createdAt);
    const tb = new Date(b.createdAt);
    if (!sameDay(ta, tb)) return false;
    return Math.abs(tb.getTime() - ta.getTime()) <= MESSAGE_GROUP_GAP_MS;
  };
  messages.forEach((m, i) => {
    const d = new Date(m.createdAt);
    const day = Number.isNaN(d.getTime()) ? null : startOfDay(d);
    if (day != null && day !== lastDay) {
      rows.push({ type: 'day', key: `day-${day}`, label: formatDayLabel(m.createdAt, now) });
      lastDay = day;
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const firstInGroup = !joined(prev, m);
    const lastInGroup = !joined(m, next);
    const isMine = m.senderId === myUserId;
    rows.push({
      type: 'message',
      key: m.id,
      message: m,
      isMine,
      firstInGroup,
      lastInGroup,
      timeLabel: m.kind === 'system' || !lastInGroup ? null : formatMessageTime(m.createdAt),
      showStatus: isMine && i === messages.length - 1,
    });
  });
  return rows;
}

/** How long a deleted conversation has left in Deleted: "14 days left", "1 day left", "Removes today". */
export function formatDeletedTimeLeft(purgeAtIso: string | null | undefined, now: Date = new Date()): string {
  if (!purgeAtIso) return '';
  const purgeAt = new Date(purgeAtIso);
  if (Number.isNaN(purgeAt.getTime())) return '';
  const days = Math.ceil((purgeAt.getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return 'Removes today';
  return days === 1 ? '1 day left' : `${days} days left`;
}
