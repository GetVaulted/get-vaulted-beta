import { describe, expect, it } from 'vitest';
import {
  LIVE_BACKGROUND_SUSPEND_DWELL_MS,
  LIVE_PIP_RETRY_DELAYS_MS,
  LIVE_VIDEO_STICKY_MS,
  canAttemptHostResumeShow,
  isAndroidStagePipStoppedADismissal,
  isStagePipUserDismissal,
  shouldAttemptLivePictureInPicture,
  shouldClearStreamPausedAfterHostResume,
  shouldCommitLiveBackgroundAfterDwell,
  shouldForceLocalStreamRefreshBeforeHostResume,
  shouldHostBackgroundAutoPause,
  shouldMuteHlsUnderLiveWebrtc,
  shouldPreferWarmHostResume,
  shouldPromoteHlsOverStageDuringGap,
  shouldShowHlsLayerForLivePip,
  shouldShowHostResumeControl,
  shouldShowLiveResumeInsteadOfRetry,
  shouldShowPreLiveRetryBanner,
  shouldStayPausedAfterIntentionalUnpublish,
  shouldSuspendHostStagePublish,
  shouldSuspendLiveStageMedia,
  shouldTreatHostResumeAsAlreadyLive,
  shouldUseStickyLiveVideoPaint,
  shouldWarmLiveHlsPipCompanion,
} from './livePlaybackAppState';

describe('livePlaybackAppState', () => {
  it('does not PiP on inactive alone via background helper (phone call overlay)', () => {
    expect(shouldAttemptLivePictureInPicture('inactive', 'active')).toBe(false);
  });

  it('prepares PiP on active → inactive (iOS home swipe begins)', async () => {
    const { shouldPrepareLivePictureInPicture, isLivePictureInPictureAppState } = await import(
      './livePlaybackAppState'
    );
    expect(shouldPrepareLivePictureInPicture('inactive', 'active')).toBe(true);
    expect(shouldPrepareLivePictureInPicture('background', 'active')).toBe(false);
    expect(isLivePictureInPictureAppState('inactive')).toBe(true);
    expect(isLivePictureInPictureAppState('background')).toBe(true);
    expect(isLivePictureInPictureAppState('active')).toBe(false);
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

  it('keeps sticky live paint during brief frame gaps', () => {
    expect(LIVE_VIDEO_STICKY_MS).toBe(1_800);
    expect(shouldUseStickyLiveVideoPaint({ videoHasData: true, stickyActive: false })).toBe(true);
    expect(shouldUseStickyLiveVideoPaint({ videoHasData: false, stickyActive: true })).toBe(true);
    expect(shouldUseStickyLiveVideoPaint({ videoHasData: false, stickyActive: false })).toBe(false);
  });

  it('promotes HLS over Stage during remount / missing frames', () => {
    expect(
      shouldPromoteHlsOverStageDuringGap({
        useWebrtc: true,
        webrtcReady: true,
        stageRemountCover: true,
        videoHasData: true,
      }),
    ).toBe(true);
    expect(
      shouldPromoteHlsOverStageDuringGap({
        useWebrtc: true,
        webrtcReady: true,
        stageRemountCover: false,
        videoHasData: false,
      }),
    ).toBe(true);
    expect(
      shouldPromoteHlsOverStageDuringGap({
        useWebrtc: true,
        webrtcReady: true,
        stageRemountCover: false,
        videoHasData: true,
      }),
    ).toBe(false);
    expect(
      shouldPromoteHlsOverStageDuringGap({
        useWebrtc: true,
        webrtcReady: false,
        stageRemountCover: true,
        videoHasData: false,
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

  it('mutes HLS under foreground Stage and unmutes for PiP / background', () => {
    expect(
      shouldMuteHlsUnderLiveWebrtc({
        webrtcReady: true,
        useWebrtc: true,
        stageSuspended: false,
        pipActive: false,
        appBackgrounded: false,
      }),
    ).toBe(true);
    expect(
      shouldMuteHlsUnderLiveWebrtc({
        webrtcReady: true,
        useWebrtc: true,
        stageSuspended: false,
        pipActive: false,
        appBackgrounded: true,
      }),
    ).toBe(false);
    expect(
      shouldMuteHlsUnderLiveWebrtc({
        webrtcReady: true,
        useWebrtc: true,
        stageSuspended: true,
        pipActive: false,
        appBackgrounded: false,
      }),
    ).toBe(false);
    // Native Stage PiP already supplies its own audio — HLS must stay muted, or buyers hear
    // both the Stage feed and the several-seconds-behind HLS mirror at once (choppy echo).
    expect(
      shouldMuteHlsUnderLiveWebrtc({
        webrtcReady: true,
        useWebrtc: true,
        stageSuspended: false,
        pipActive: true,
        appBackgrounded: false,
      }),
    ).toBe(true);
    // Once Stage's own audio has been suspended (no longer providing PiP audio), HLS becomes the
    // fallback and must unmute even if `pipActive` is still momentarily true.
    expect(
      shouldMuteHlsUnderLiveWebrtc({
        webrtcReady: true,
        useWebrtc: true,
        stageSuspended: true,
        pipActive: true,
        appBackgrounded: false,
      }),
    ).toBe(false);
  });

  it('mutes HLS once the buyer closes PiP while still backgrounded, even though appBackgrounded stays true', () => {
    expect(
      shouldMuteHlsUnderLiveWebrtc({
        webrtcReady: true,
        useWebrtc: true,
        stageSuspended: false,
        pipActive: false,
        appBackgrounded: true,
        pipDismissedWhileBackgrounded: true,
      }),
    ).toBe(true);
  });

  it('keeps HLS VideoView mounted for warm companion and PiP after Stage paints', () => {
    expect(
      shouldShowHlsLayerForLivePip({
        attachHls: true,
        playbackActive: true,
        surfaceError: false,
        webrtcReady: false,
        warmPipCompanion: false,
        pipActive: false,
        appBackgrounded: false,
      }),
    ).toBe(true);
    expect(
      shouldShowHlsLayerForLivePip({
        attachHls: true,
        playbackActive: true,
        surfaceError: false,
        webrtcReady: true,
        warmPipCompanion: false,
        pipActive: false,
        appBackgrounded: false,
      }),
    ).toBe(false);
    expect(
      shouldShowHlsLayerForLivePip({
        attachHls: true,
        playbackActive: true,
        surfaceError: false,
        webrtcReady: true,
        warmPipCompanion: true,
        pipActive: false,
        appBackgrounded: false,
      }),
    ).toBe(true);
    expect(
      shouldShowHlsLayerForLivePip({
        attachHls: true,
        playbackActive: true,
        surfaceError: false,
        webrtcReady: true,
        warmPipCompanion: false,
        pipActive: true,
        appBackgrounded: false,
      }),
    ).toBe(true);
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

  it('treats a bare native "stopped" (no preceding restore) as the user closing PiP with the X', () => {
    expect(isStagePipUserDismissal({ state: 'stopped', precededByRestore: false })).toBe(true);
  });

  it('does not treat "stopped" as a dismissal when it was preceded by a restore-tap', () => {
    expect(isStagePipUserDismissal({ state: 'stopped', precededByRestore: true })).toBe(false);
  });

  it('never treats "started" or "restored" as a dismissal, regardless of restore history', () => {
    expect(isStagePipUserDismissal({ state: 'started', precededByRestore: false })).toBe(false);
    expect(isStagePipUserDismissal({ state: 'started', precededByRestore: true })).toBe(false);
    expect(isStagePipUserDismissal({ state: 'restored', precededByRestore: false })).toBe(false);
    expect(isStagePipUserDismissal({ state: 'restored', precededByRestore: true })).toBe(false);
  });

  it('Android restore-tap (stopped then restored within the debounce) is not a dismissal', () => {
    expect(isAndroidStagePipStoppedADismissal(true)).toBe(false);
  });

  it('Android real dismissal (no restored within the debounce) is a dismissal', () => {
    expect(isAndroidStagePipStoppedADismissal(false)).toBe(true);
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

  it('forces a local camera stream refresh before Android resumes from a real backgrounding', () => {
    expect(
      shouldForceLocalStreamRefreshBeforeHostResume({
        platform: 'android',
        backgroundedWhilePaused: true,
      }),
    ).toBe(true);
  });

  it('does not force a refresh for a foreground Pause-button tap (Surface never torn down)', () => {
    expect(
      shouldForceLocalStreamRefreshBeforeHostResume({
        platform: 'android',
        backgroundedWhilePaused: false,
      }),
    ).toBe(false);
  });

  it('never forces a refresh on iOS — camera sessions survive backgrounding there', () => {
    expect(
      shouldForceLocalStreamRefreshBeforeHostResume({
        platform: 'ios',
        backgroundedWhilePaused: true,
      }),
    ).toBe(false);
  });
});
