import {
  canPerformModeratorAction,
  effectiveModeratorLevel,
  resolveModerationActor,
  showModeratorTools,
} from './liveModeratorPermissions';

describe('liveModeratorPermissions', () => {
  it('treats local seller as host when API has not loaded yet', () => {
    const actor = resolveModerationActor({
      canModerate: false,
      isHost: false,
      isModerator: false,
      viewerRole: 'buyer',
      moderatorLevel: null,
      allowedActions: [],
      userId: 'seller-1',
      sellerIdHint: 'seller-1',
    });

    expect(actor.isHost).toBe(true);
    expect(actor.canModerate).toBe(true);
    expect(showModeratorTools(actor.isModerator, actor.canModerate, actor.isHost)).toBe(true);
    expect(canPerformModeratorAction({
      actionType: 'slow_mode',
      isModerator: actor.isModerator,
      isHost: actor.isHost,
      canModerate: actor.canModerate,
      moderatorLevel: actor.moderatorLevel,
      allowedActions: actor.allowedActions,
    })).toBe(true);
  });

  it('falls back to show level for assigned moderators missing level', () => {
    expect(effectiveModeratorLevel({ isHost: false, moderatorLevel: null, isModerator: true })).toBe('show');
    expect(canPerformModeratorAction({
      actionType: 'delete_message',
      isModerator: true,
      moderatorLevel: null,
    })).toBe(true);
    expect(canPerformModeratorAction({
      actionType: 'kick',
      isModerator: true,
      moderatorLevel: null,
    })).toBe(true);
    expect(canPerformModeratorAction({
      actionType: 'slow_mode',
      isModerator: true,
      moderatorLevel: null,
    })).toBe(true);
  });
});
