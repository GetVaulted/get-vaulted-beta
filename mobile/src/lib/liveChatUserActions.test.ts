import { describe, expect, it } from 'vitest';
import {
  appendMentionToDraft,
  canShowLiveChatBanOption,
  canShowLiveChatKickOption,
} from './liveChatUserActions';

describe('appendMentionToDraft', () => {
  it('appends a mention with spacing', () => {
    expect(appendMentionToDraft('', 'seller1')).toBe('@seller1 ');
    expect(appendMentionToDraft('hello', 'seller1')).toBe('hello @seller1 ');
    expect(appendMentionToDraft('hello ', 'seller1')).toBe('hello @seller1 ');
  });

  it('strips leading @ from username', () => {
    expect(appendMentionToDraft('', '@seller1')).toBe('@seller1 ');
  });
});

describe('live chat moderation menu options', () => {
  it('allows kick when head mod actions include room_ban', () => {
    expect(
      canShowLiveChatKickOption({
        targetUserId: 'buyer-1',
        hostUserId: 'host-1',
        allowedActions: ['room_ban'],
      }),
    ).toBe(true);
  });

  it('blocks kick on host and without user id', () => {
    expect(
      canShowLiveChatKickOption({
        targetUserId: 'host-1',
        hostUserId: 'host-1',
        allowedActions: ['room_ban'],
      }),
    ).toBe(false);
    expect(
      canShowLiveChatKickOption({
        hostUserId: 'host-1',
        allowedActions: ['room_ban'],
      }),
    ).toBe(false);
  });

  it('allows seller ban for host only', () => {
    expect(
      canShowLiveChatBanOption({
        targetUserId: 'buyer-1',
        hostUserId: 'host-1',
        isHost: true,
        allowedActions: ['seller_stream_ban'],
      }),
    ).toBe(true);
    expect(
      canShowLiveChatBanOption({
        targetUserId: 'buyer-1',
        hostUserId: 'host-1',
        isHost: false,
        allowedActions: ['seller_stream_ban'],
      }),
    ).toBe(false);
  });
});
