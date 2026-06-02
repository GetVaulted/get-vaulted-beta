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
});
