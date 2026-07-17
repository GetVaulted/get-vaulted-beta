import { describe, expect, it } from 'vitest';
import {
  LIVE_PIP_RETRY_DELAYS_MS,
  shouldAttemptLivePictureInPicture,
  shouldSuspendHostStagePublish,
  shouldSuspendLiveStageMedia,
  shouldWarmLiveHlsPipCompanion,
} from './livePlaybackAppState';

describe('livePlaybackAppState', () => {
  it('does not PiP on inactive alone (phone call overlay)', () => {
    expect(shouldAttemptLivePictureInPicture('inactive', 'active')).toBe(false);
  });

  it('PiP when entering background from active or inactive (home swipe)', () => {
    expect(shouldAttemptLivePictureInPicture('background', 'active')).toBe(true);
    expect(shouldAttemptLivePictureInPicture('background', 'inactive')).toBe(true);
    expect(shouldAttemptLivePictureInPicture('background', 'background')).toBe(false);
  });

  it('does not suspend Stage media on inactive notification overlays', () => {
    expect(shouldSuspendLiveStageMedia('inactive')).toBe(false);
    expect(shouldSuspendLiveStageMedia('background')).toBe(true);
    expect(shouldSuspendLiveStageMedia('active')).toBe(false);
    expect(shouldSuspendHostStagePublish('inactive')).toBe(false);
    expect(shouldSuspendHostStagePublish('background')).toBe(true);
  });

  it('warms HLS PiP companion while actively watching WebRTC with a playback URL', () => {
    expect(
      shouldWarmLiveHlsPipCompanion({
        playbackActive: true,
        useWebrtc: true,
        roomLifecycleLive: true,
        playbackUrl: 'https://playback.m3u8',
      }),
    ).toBe(true);
    expect(
      shouldWarmLiveHlsPipCompanion({
        playbackActive: true,
        useWebrtc: true,
        roomLifecycleLive: true,
        playbackUrl: null,
      }),
    ).toBe(false);
    expect(
      shouldWarmLiveHlsPipCompanion({
        playbackActive: false,
        useWebrtc: true,
        roomLifecycleLive: true,
        playbackUrl: 'https://playback.m3u8',
      }),
    ).toBe(false);
  });

  it('retries PiP long enough for Stage HLS mirror startup', () => {
    expect(LIVE_PIP_RETRY_DELAYS_MS.at(-1)).toBeGreaterThanOrEqual(6000);
  });
});
