import { describe, expect, it } from 'vitest';
import {
  dedupeChatMessagesById,
  dedupeViewerEventMessages,
  formatViewerEventName,
  isViewerEventMessage,
  prepareFloatingChatDisplay,
  tailUniqueChatMessages,
  VIEWER_EVENT_JOIN_BODY,
  VIEWER_EVENT_SHARE_BODY,
} from './liveRoomChatMessages';
import type { ChatMessage } from '../types';

function msg(id: string, text: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id, user: 'u', text, isHost: false, messageType: 'chat', ...overrides };
}

describe('liveRoomChatMessages', () => {
  it('dedupes repeated ids in order', () => {
    const input = [msg('a', '1'), msg('b', '2'), msg('a', '1'), msg('c', '3')];
    expect(dedupeChatMessagesById(input).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('tails unique messages', () => {
    const input = [msg('1', 'a'), msg('2', 'b'), msg('1', 'a'), msg('3', 'c')];
    expect(tailUniqueChatMessages(input, 2).map((m) => m.id)).toEqual(['2', '3']);
  });

  it('detects viewer join/share events', () => {
    expect(
      isViewerEventMessage({
        id: '1',
        user: 'alice',
        text: VIEWER_EVENT_JOIN_BODY,
        messageType: 'system',
      }),
    ).toBe(true);
    expect(
      isViewerEventMessage({
        id: '1b',
        user: 'alice',
        text: 'joined 👋',
        messageType: 'system',
      }),
    ).toBe(true);
    expect(
      isViewerEventMessage({
        id: '2',
        user: 'bob',
        text: VIEWER_EVENT_SHARE_BODY,
        messageType: 'system',
      }),
    ).toBe(true);
    expect(isViewerEventMessage(msg('3', 'hello'))).toBe(false);
  });

  it('dedupes legacy and new join lines per username', () => {
    const input = [
      {
        id: '1',
        user: 'alice',
        text: 'joined 👋',
        messageType: 'system' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        user: 'Alice',
        text: VIEWER_EVENT_JOIN_BODY,
        messageType: 'system' as const,
        createdAt: '2026-01-01T00:01:00.000Z',
      },
      msg('3', 'hi there', { createdAt: '2026-01-01T00:02:00.000Z' }),
    ];
    expect(dedupeViewerEventMessages(input).map((m) => m.id)).toEqual(['2', '3']);
  });

  it('formats viewer event names without @ prefix', () => {
    expect(formatViewerEventName('@alice')).toBe('alice');
    expect(formatViewerEventName('bob')).toBe('bob');
  });

  it('prepares floating chat oldest-to-newest for bottom-anchored feed', () => {
    const input = [
      msg('1', 'old', { createdAt: '2026-01-01T00:00:00.000Z' }),
      msg('2', 'mid', { createdAt: '2026-01-01T00:01:00.000Z' }),
      msg('3', 'new', { createdAt: '2026-01-01T00:02:00.000Z' }),
    ];
    expect(prepareFloatingChatDisplay(input).map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('keeps join events inline with chat in floating display order', () => {
    const input = [
      msg('1', 'hello', { createdAt: '2026-01-01T00:01:00.000Z' }),
      {
        id: '2',
        user: 'bob',
        text: VIEWER_EVENT_JOIN_BODY,
        messageType: 'system' as const,
        createdAt: '2026-01-01T00:02:00.000Z',
      },
    ];
    expect(prepareFloatingChatDisplay(input).map((m) => m.id)).toEqual(['1', '2']);
  });

  it('places a re-join after chat that arrived in between', () => {
    const input = [
      {
        id: '1',
        user: 'alice',
        text: VIEWER_EVENT_JOIN_BODY,
        messageType: 'system' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      msg('2', 'between', { createdAt: '2026-01-01T00:01:00.000Z' }),
      {
        id: '3',
        user: 'alice',
        text: VIEWER_EVENT_JOIN_BODY,
        messageType: 'system' as const,
        createdAt: '2026-01-01T00:02:00.000Z',
      },
    ];
    expect(prepareFloatingChatDisplay(input).map((m) => m.id)).toEqual(['2', '3']);
  });
});
