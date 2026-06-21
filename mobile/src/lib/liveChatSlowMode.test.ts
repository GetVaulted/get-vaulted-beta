import { describe, expect, it } from 'vitest';
import {
  computeSlowModeWaitMs,
  findLatestUserChatSentAt,
  parseSlowModeErrorMessage,
  slowModeComposerPlaceholder,
} from './liveChatSlowMode';
import type { ChatMessage } from '../types';

describe('liveChatSlowMode', () => {
  it('finds the latest chat message from the current user', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        user: 'a',
        text: 'hi',
        senderId: 'u1',
        messageType: 'chat',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        user: 'a',
        text: 'again',
        senderId: 'u1',
        messageType: 'chat',
        createdAt: '2026-01-01T00:00:10.000Z',
      },
    ];
    expect(findLatestUserChatSentAt(messages, 'u1')).toBe(new Date('2026-01-01T00:00:10.000Z').getTime());
  });

  it('computes remaining slow-mode wait time', () => {
    const lastSentAtMs = 1_000;
    const waitMs = computeSlowModeWaitMs({
      slowModeSeconds: 10,
      lastSentAtMs,
      nowMs: 4_000,
      exempt: false,
    });
    expect(waitMs).toBe(7_000);
  });

  it('exempts host and moderators', () => {
    expect(
      computeSlowModeWaitMs({
        slowModeSeconds: 10,
        lastSentAtMs: 1_000,
        nowMs: 2_000,
        exempt: true,
      }),
    ).toBe(0);
  });

  it('parses slow-mode API errors', () => {
    expect(parseSlowModeErrorMessage('Slow mode — wait 8s between messages.')).toBe(8);
  });

  it('builds blocked composer placeholder', () => {
    expect(
      slowModeComposerPlaceholder({
        slowModeSeconds: 10,
        cooldownSeconds: 4,
        chatBlocked: true,
        exempt: false,
      }),
    ).toBe('Chat in 4s…');
  });
});
