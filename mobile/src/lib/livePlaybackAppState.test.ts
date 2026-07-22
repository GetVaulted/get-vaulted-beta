import { describe, expect, it } from 'vitest';
import {
  LIVE_PIP_RETRY_DELAYS_MS,
  shouldAttemptLivePictureInPicture,
  shouldHostBackgroundAutoPause,
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
  });

  it('pauses host publish only on true background (not Control Center inactive)', () => {
    expect(shouldSuspendHostStagePublish('inactive')).toBe(false);
    expect(shouldSuspendHostStagePublish('background')).toBe(true);
    expect(shouldSuspendHostStagePublish('active')).toBe(false);
  });

  it('auto-pauses a live host on background so buyers get Host paused', () => {
    expect(
      shouldHostBackgroundAutoPause({
        appState: 'background',
        wentLive: true,
        intentionalStop: false,
        phase: 'live',
      }),
    ).toBe(true);
    expect(
      shouldHostBackgroundAutoPause({
        appState: 'inactive',
        wentLive: true,
        intentionalStop: false,
        phase: 'live',
      }),
    ).toBe(false);
    expect(
      shouldHostBackgroundAutoPause({
        appState: 'background',
        wentLive: false,
        intentionalStop: false,
        phase: 'live',
      }),
    ).toBe(false);
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
