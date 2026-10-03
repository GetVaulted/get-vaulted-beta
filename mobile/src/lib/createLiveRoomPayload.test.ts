import { describe, expect, it } from 'vitest';
import { buildCreateLiveRoomPayload } from './createLiveRoomPayload';

describe('buildCreateLiveRoomPayload', () => {
  it('matches web start-now auction payload', () => {
    expect(
      buildCreateLiveRoomPayload({
        title: 'Night session',
        description: 'Rules in chat',
        roomType: 'auction',
        scheduleMode: 'now',
        thumbnailUrl: 'https://cdn.example/thumb.jpg',
      }),
    ).toEqual({
      title: 'Night session',
      description: 'Rules in chat',
      roomType: 'auction',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
    });
  });

  it('includes teaser video when url and duration are set', () => {
    expect(
      buildCreateLiveRoomPayload({
        title: 'Preview show',
        roomType: 'auction',
        scheduleMode: 'later',
        scheduledStartAt: '2026-07-20T20:00:00.000Z',
        teaserVideoUrl: 'https://cdn.example/teaser.mp4',
        teaserVideoDurationMs: 12_000,
      }),
    ).toMatchObject({
      teaserVideoUrl: 'https://cdn.example/teaser.mp4',
      teaserVideoDurationMs: 12_000,
      scheduledStartAt: '2026-07-20T20:00:00.000Z',
    });
  });

  it('matches web break payload with auction spots', () => {
    expect(
      buildCreateLiveRoomPayload({
        title: 'PYT break',
        roomType: 'break',
        scheduleMode: 'later',
        scheduledStartAt: '2026-06-01T20:00:00.000Z',
        teamBoardLeague: 'nfl',
        breakTotalSpots: '32',
        breakPricingMode: 'auction',
        teamSelectionBoardEnabled: true,
        tipModeratorId: 'mod-1',
        tipsToModerator: true,
      }),
    ).toEqual({
      title: 'PYT break',
      description: '',
      roomType: 'break',
      scheduledStartAt: '2026-06-01T20:00:00.000Z',
      teamBoardLeague: 'nfl',
      teamSelectionBoardEnabled: true,
      breakTotalSpots: 32,
      breakPricingMode: 'auction',
      breakSpotPriceUsd: null,
      tipModeratorId: 'mod-1',
      tipsToModerator: true,
    });
  });

  it('matches web fixed break spot price', () => {
    expect(
      buildCreateLiveRoomPayload({
        title: 'Fixed spots',
        roomType: 'break',
        scheduleMode: 'now',
        breakPricingMode: 'fixed',
        breakSpotPrice: '25',
        teamSelectionBoardEnabled: false,
      }),
    ).toMatchObject({
      breakPricingMode: 'fixed',
      breakSpotPriceUsd: 25,
      teamSelectionBoardEnabled: false,
    });
  });

  it('matches web hybrid break pricing', () => {
    expect(
      buildCreateLiveRoomPayload({
        title: 'Hybrid break',
        roomType: 'break',
        scheduleMode: 'now',
        breakPricingMode: 'hybrid',
        breakSpotPrice: '40',
      }),
    ).toMatchObject({
      breakPricingMode: 'hybrid',
      breakSpotPriceUsd: 40,
    });
  });

  it('allows hybrid break without default spot price', () => {
    expect(
      buildCreateLiveRoomPayload({
        title: 'Hybrid break',
        roomType: 'break',
        scheduleMode: 'now',
        breakPricingMode: 'hybrid',
      }),
    ).toMatchObject({
      breakPricingMode: 'hybrid',
      breakSpotPriceUsd: null,
    });
  });

  it('includes private discovery visibility when set', () => {
    expect(
      buildCreateLiveRoomPayload({
        title: 'Invite-only',
        roomType: 'auction',
        scheduleMode: 'now',
        discoveryVisibility: 'private',
      }),
    ).toEqual({
      title: 'Invite-only',
      description: '',
      roomType: 'auction',
      discoveryVisibility: 'private',
    });
  });
});
