import { describe, expect, it } from 'vitest';
import { resolveHostVideoFeedStatus } from './hostVideoFeedStatus';

describe('resolveHostVideoFeedStatus', () => {
  it('shows LIVE only when this device is publishing live and not paused', () => {
    expect(
      resolveHostVideoFeedStatus({
        roomStatus: 'live',
        broadcastPhase: 'live',
        streamPaused: false,
        companionMode: false,
        roomBroadcastOnAir: true,
        streamHealth: 'live',
      }),
    ).toEqual({ kind: 'live', label: 'LIVE', videoOnAir: true });
  });

  it('does not show LIVE while starting', () => {
    expect(
      resolveHostVideoFeedStatus({
        roomStatus: 'live',
        broadcastPhase: 'starting',
        streamPaused: false,
        companionMode: false,
        roomBroadcastOnAir: false,
        streamHealth: 'connecting',
      }).kind,
    ).toBe('connecting');
  });

  it('shows Paused when stream is paused even if phase is live', () => {
    expect(
      resolveHostVideoFeedStatus({
        roomStatus: 'live',
        broadcastPhase: 'live',
        streamPaused: true,
        companionMode: false,
        roomBroadcastOnAir: false,
        streamHealth: 'live',
      }),
    ).toEqual({ kind: 'paused', label: 'Paused', videoOnAir: false });
  });

  it('shows Live elsewhere only when companion + remote publisher', () => {
    expect(
      resolveHostVideoFeedStatus({
        roomStatus: 'live',
        broadcastPhase: 'idle',
        streamPaused: false,
        companionMode: true,
        roomBroadcastOnAir: true,
        streamHealth: 'live',
      }),
    ).toEqual({ kind: 'elsewhere', label: 'Live elsewhere', videoOnAir: true });
  });

  it('shows No video when alone with soft Stage warm-up (not elsewhere)', () => {
    expect(
      resolveHostVideoFeedStatus({
        roomStatus: 'live',
        broadcastPhase: 'idle',
        streamPaused: false,
        companionMode: false,
        roomBroadcastOnAir: true,
        streamHealth: 'offline',
      }),
    ).toEqual({ kind: 'offline', label: 'No video', videoOnAir: false });
  });
});
