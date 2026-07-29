import { describe, expect, it } from 'vitest';
import {
  LIVE_BACKGROUND_SUSPEND_DWELL_MS,
  LIVE_PIP_RETRY_DELAYS_MS,
  canAttemptHostResumeShow,
  shouldAttemptLivePictureInPicture,
  shouldClearStreamPausedAfterHostResume,
  shouldCommitLiveBackgroundAfterDwell,
  shouldHostBackgroundAutoPause,
  shouldPreferWarmHostResume,
  shouldShowHostResumeControl,
  shouldShowLiveResumeInsteadOfRetry,
  shouldShowPreLiveRetryBanner,
  shouldStayPausedAfterIntentionalUnpublish,
  shouldSuspendHostStagePublish,
  shouldSuspendLiveStageMedia,
  shouldTreatHostResumeAsAlreadyLive,
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

  it('only commits Stage suspend after a background dwell (brief exit/return is a no-op)', () => {
    expect(shouldCommitLiveBackgroundAfterDwell(0)).toBe(false);
    expect(shouldCommitLiveBackgroundAfterDwell(699)).toBe(false);
    expect(shouldCommitLiveBackgroundAfterDwell(LIVE_BACKGROUND_SUSPEND_DWELL_MS)).toBe(true);
    expect(shouldCommitLiveBackgroundAfterDwell(2000)).toBe(true);
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

  it('clears streamPaused for buyers only after host Play republishes', () => {
    expect(shouldClearStreamPausedAfterHostResume(true)).toBe(true);
    expect(shouldClearStreamPausedAfterHostResume(false)).toBe(false);
  });

  it('treats live+publishing as already-resumed so Play can clear stuck streamPaused', () => {
    expect(
      shouldTreatHostResumeAsAlreadyLive({
        phase: 'live',
        publishing: true,
        intentionalPause: false,
      }),
    ).toBe(true);
    expect(
      shouldTreatHostResumeAsAlreadyLive({
        phase: 'live',
        publishing: false,
        intentionalPause: false,
      }),
    ).toBe(false);
    expect(
      shouldTreatHostResumeAsAlreadyLive({
        phase: 'paused',
        publishing: false,
        intentionalPause: true,
      }),
    ).toBe(false);
  });

  it('allows Play while live+streamPaused even when Stage phase is still live', () => {
    expect(
      canAttemptHostResumeShow({
        phase: 'live',
        publishing: true,
        intentionalPause: false,
      }),
    ).toBe(true);
    expect(
      canAttemptHostResumeShow({
        phase: 'live',
        publishing: false,
        intentionalPause: true,
      }),
    ).toBe(true);
    expect(
      canAttemptHostResumeShow({
        phase: 'stopping',
        publishing: false,
        intentionalPause: false,
      }),
    ).toBe(false);
  });

  it('prefers warm Play only for short minimize; overnight Pause forces cold rejoin', () => {
    expect(
      shouldPreferWarmHostResume({
        phase: 'paused',
        intentionalPause: true,
        pauseDurationMs: 5_000,
      }),
    ).toBe(true);
    expect(
      shouldPreferWarmHostResume({
        phase: 'paused',
        intentionalPause: true,
        pauseDurationMs: 60_000,
      }),
    ).toBe(false);
    expect(shouldPreferWarmHostResume({ phase: 'paused', intentionalPause: true })).toBe(false);
    expect(shouldPreferWarmHostResume({ phase: 'idle', intentionalPause: true, pauseDurationMs: 1_000 })).toBe(
      false,
    );
    expect(
      shouldPreferWarmHostResume({ phase: 'paused', intentionalPause: false, pauseDurationMs: 1_000 }),
    ).toBe(false);
  });

  it('keeps toolbar Play visible on live rooms when Stage is idle/paused or streamPaused', () => {
    expect(shouldShowHostResumeControl({ roomStatus: 'live', phase: 'paused' })).toBe(true);
    expect(shouldShowHostResumeControl({ roomStatus: 'live', phase: 'idle' })).toBe(true);
    expect(
      shouldShowHostResumeControl({ roomStatus: 'live', phase: 'live', streamPaused: true }),
    ).toBe(true);
    expect(shouldShowHostResumeControl({ roomStatus: 'live', phase: 'live' })).toBe(false);
    expect(shouldShowHostResumeControl({ roomStatus: 'scheduled', phase: 'idle' })).toBe(false);
  });

  it('keeps Host paused after intentional unpublish instead of idle Retry', () => {
    expect(shouldStayPausedAfterIntentionalUnpublish(true)).toBe(true);
    expect(shouldStayPausedAfterIntentionalUnpublish(false)).toBe(false);
  });

  it('while room is live shows Resume recovery instead of pre-live Retry', () => {
    expect(
      shouldShowLiveResumeInsteadOfRetry({
        roomStatus: 'live',
        broadcastPhase: 'idle',
        hasBroadcastError: true,
      }),
    ).toBe(true);
    expect(
      shouldShowPreLiveRetryBanner({
        roomStatus: 'live',
        broadcastPhase: 'idle',
        hasBroadcastError: true,
      }),
    ).toBe(false);
    expect(
      shouldShowPreLiveRetryBanner({
        roomStatus: 'scheduled',
        broadcastPhase: 'idle',
        hasBroadcastError: true,
      }),
    ).toBe(true);
  });
});
