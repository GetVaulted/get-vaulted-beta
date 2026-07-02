import {
  canShowLiveChatBanOption,
  canShowLiveChatKickOption,
  canShowLiveChatRemoveKickOption,
  canShowLiveChatRemoveSellerBanOption,
} from './liveChatUserActions';

describe('liveChatUserActions', () => {
  const targetUserId = 'buyer-1';
  const hostUserId = 'host-1';

  it('lets show mods kick and ban from the show', () => {
    expect(
      canShowLiveChatKickOption({
        targetUserId,
        hostUserId,
        allowedActions: [],
        isModerator: true,
        canModerate: true,
        moderatorLevel: 'show',
      }),
    ).toBe(true);
    expect(
      canShowLiveChatBanOption({
        targetUserId,
        hostUserId,
        allowedActions: [],
        isModerator: true,
        canModerate: true,
        moderatorLevel: 'show',
      }),
    ).toBe(true);
  });

  it('lets show mods undo kick and seller bans', () => {
    expect(
      canShowLiveChatRemoveKickOption({
        targetUserId,
        hostUserId,
        allowedActions: [],
        isModerator: true,
        canModerate: true,
        moderatorLevel: 'show',
      }),
    ).toBe(true);
    expect(
      canShowLiveChatRemoveSellerBanOption({
        targetUserId,
        hostUserId,
        allowedActions: [],
        isModerator: true,
        canModerate: true,
        moderatorLevel: 'show',
      }),
    ).toBe(true);
  });

  it('blocks punitive actions on the host', () => {
    expect(
      canShowLiveChatKickOption({
        targetUserId: hostUserId,
        hostUserId,
        allowedActions: ['kick'],
        isModerator: true,
        canModerate: true,
        moderatorLevel: 'show',
      }),
    ).toBe(false);
    expect(
      canShowLiveChatBanOption({
        targetUserId: hostUserId,
        hostUserId,
        allowedActions: ['room_ban'],
        isModerator: true,
        canModerate: true,
        moderatorLevel: 'show',
      }),
    ).toBe(false);
  });

  it('does not expose kick or ban to regular buyers', () => {
    expect(
      canShowLiveChatKickOption({
        targetUserId,
        hostUserId,
        allowedActions: [],
        isModerator: false,
        canModerate: false,
        moderatorLevel: null,
      }),
    ).toBe(false);
    expect(
      canShowLiveChatBanOption({
        targetUserId,
        hostUserId,
        allowedActions: [],
        isModerator: false,
        canModerate: false,
        moderatorLevel: null,
      }),
    ).toBe(false);
  });

  it('lets the host kick and ban from the show', () => {
    expect(
      canShowLiveChatKickOption({
        targetUserId,
        hostUserId,
        allowedActions: [],
        isHost: true,
        isModerator: false,
        canModerate: true,
        moderatorLevel: 'head',
      }),
    ).toBe(true);
    expect(
      canShowLiveChatBanOption({
        targetUserId,
        hostUserId,
        allowedActions: [],
        isHost: true,
        isModerator: false,
        canModerate: true,
        moderatorLevel: 'head',
      }),
    ).toBe(true);
  });
});
