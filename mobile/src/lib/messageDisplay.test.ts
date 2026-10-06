import { describe, expect, it } from 'vitest';
import type { ThreadMessage } from '../types/messages';
import { buildThreadRows, formatDayLabel, formatInboxTime, inboxPreviewText } from './messageDisplay';

const NOW = new Date(2026, 9, 7, 15, 0, 0); // Oct 7 2026, 3pm local

function msg(id: string, senderId: string, at: Date, over: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id,
    senderId,
    body: id,
    kind: 'user',
    systemEvent: null,
    readAt: null,
    createdAt: at.toISOString(),
    imageUrl: null,
    ...over,
  };
}

describe('formatInboxTime', () => {
  it('uses clock time today, then Yesterday, weekday, and date', () => {
    expect(formatInboxTime(new Date(2026, 9, 7, 14, 14).toISOString(), NOW)).toMatch(/2:14\s?PM/);
    expect(formatInboxTime(new Date(2026, 9, 6, 9, 0).toISOString(), NOW)).toBe('Yesterday');
    expect(formatInboxTime(new Date(2026, 9, 4, 9, 0).toISOString(), NOW)).toBe('Sun');
    expect(formatInboxTime(new Date(2026, 8, 20, 9, 0).toISOString(), NOW)).toBe('Sep 20');
  });
});

describe('formatDayLabel', () => {
  it('labels today, yesterday and older days', () => {
    expect(formatDayLabel(new Date(2026, 9, 7, 1).toISOString(), NOW)).toBe('Today');
    expect(formatDayLabel(new Date(2026, 9, 6, 23).toISOString(), NOW)).toBe('Yesterday');
    expect(formatDayLabel(new Date(2026, 9, 1, 12).toISOString(), NOW)).toBe('Oct 1');
    expect(formatDayLabel(new Date(2025, 11, 25, 12).toISOString(), NOW)).toBe('Dec 25, 2025');
  });
});

describe('inboxPreviewText', () => {
  it('drops the camera emoji from photo previews', () => {
    expect(inboxPreviewText('📷 Photo')).toBe('Photo');
    expect(inboxPreviewText('hello')).toBe('hello');
    expect(inboxPreviewText(null)).toBe('');
  });
});

describe('buildThreadRows', () => {
  it('adds day separators and groups close messages from one sender', () => {
    const rows = buildThreadRows(
      [
        msg('a', 'them', new Date(2026, 9, 6, 20, 0)),
        msg('b', 'them', new Date(2026, 9, 7, 14, 0)),
        msg('c', 'them', new Date(2026, 9, 7, 14, 2)),
        msg('d', 'me', new Date(2026, 9, 7, 14, 3)),
      ],
      'me',
      NOW,
    );
    expect(rows.map((r) => (r.type === 'day' ? `day:${r.label}` : r.key))).toEqual([
      'day:Yesterday',
      'a',
      'day:Today',
      'b',
      'c',
      'd',
    ]);
    const byKey = Object.fromEntries(rows.filter((r) => r.type === 'message').map((r) => [r.key, r]));
    const b = byKey.b as Extract<(typeof rows)[number], { type: 'message' }>;
    const c = byKey.c as Extract<(typeof rows)[number], { type: 'message' }>;
    const d = byKey.d as Extract<(typeof rows)[number], { type: 'message' }>;
    expect(b.firstInGroup).toBe(true);
    expect(b.lastInGroup).toBe(false);
    expect(b.timeLabel).toBeNull();
    expect(c.firstInGroup).toBe(false);
    expect(c.lastInGroup).toBe(true);
    expect(c.timeLabel).toMatch(/2:02\s?PM/);
    expect(d.isMine).toBe(true);
    expect(d.showStatus).toBe(true);
  });

  it('does not group across a long gap or a system message', () => {
    const rows = buildThreadRows(
      [
        msg('a', 'them', new Date(2026, 9, 7, 9, 0)),
        msg('b', 'them', new Date(2026, 9, 7, 9, 30)),
        msg('s', 'them', new Date(2026, 9, 7, 9, 31), { kind: 'system' }),
      ],
      'me',
      NOW,
    );
    const msgs = rows.filter((r) => r.type === 'message') as Extract<(typeof rows)[number], { type: 'message' }>[];
    expect(msgs[0].lastInGroup).toBe(true);
    expect(msgs[1].firstInGroup).toBe(true);
    expect(msgs[2].timeLabel).toBeNull();
  });
});
