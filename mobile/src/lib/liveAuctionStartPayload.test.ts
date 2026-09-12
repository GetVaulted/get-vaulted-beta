import { describe, expect, it } from 'vitest';
import {
  AUCTION_DURATION_PRESETS,
  DEFAULT_AUCTION_SEC,
  buildHostStartAuctionPatch,
  clampAuctionDurationSec,
} from './liveAuctionStartPayload';

describe('liveAuctionStartPayload', () => {
  it('exposes 15/30/45/60s presets for the host timer picker', () => {
    expect(AUCTION_DURATION_PRESETS).toEqual([15, 30, 45, 60]);
    expect(DEFAULT_AUCTION_SEC).toBe(15);
  });

  it('builds startAuction payload with the selected duration', () => {
    expect(
      buildHostStartAuctionPatch({
        auctionDurationSec: 45,
        clutchTimeEnabled: true,
      }),
    ).toEqual({
      action: 'startAuction',
      auctionDurationSec: 45,
      clutchTimeEnabled: true,
    });
  });

  it('clamps invalid durations into the API range', () => {
    expect(clampAuctionDurationSec(1)).toBe(3);
    expect(clampAuctionDurationSec(9000)).toBe(7200);
    expect(clampAuctionDurationSec(Number.NaN)).toBe(DEFAULT_AUCTION_SEC);
  });
});
