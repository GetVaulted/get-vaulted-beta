import type { AppStateStatus } from 'react-native';

/**
 * Brief home / app-switcher flickers (exit → return in &lt;1s) must not tear down IVS Stage.
 * Leave+rejoin racing a native surface remount crashes the process on resume.
 */
export const LIVE_BACKGROUND_SUSPEND_DWELL_MS = 700;

/** True once the app has stayed backgrounded long enough to safely suspend Stage / minimize host. */
export function shouldCommitLiveBackgroundAfterDwell(dwellMs: number): boolean {
  return dwellMs >= LIVE_BACKGROUND_SUSPEND_DWELL_MS;
}

/** Phone calls, Control Center, and Siri use `inactive` — not a true background transition. */
export function isLiveAudioInterruptionState(state: AppStateStatus): boolean {
  return state === 'inactive' || state === 'background';
}

/**
 * Start PiP when the app actually backgrounds (home swipe ends in `background`).
 * Do NOT start on `active → inactive` alone — that is incoming calls and crashes CallKit.
 * iOS home gesture is often `active → inactive → background`; allow PiP on that final step.
 */
export function shouldAttemptLivePictureInPicture(
  next: AppStateStatus,
  previous: AppStateStatus,
): boolean {
  return next === 'background' && previous !== 'background';
}

/**
 * Keep a hidden HLS player mounted while watching a WebRTC Stage stream so PiP can
 * attach the moment the user leaves the app. Must be warm *before* background.
 */
/** Retry PiP for several seconds — Stage→HLS composition can lag WebRTC by ~5–15s. */
export const LIVE_PIP_RETRY_DELAYS_MS = [0, 150, 400, 900, 1500, 2500, 4000, 6000] as const;

export function shouldWarmLiveHlsPipCompanion(args: {
  playbackActive: boolean;
  useWebrtc: boolean;
  roomLifecycleLive: boolean;
  playbackUrl: string | null;
}): boolean {
  return (
    args.playbackActive &&
    args.useWebrtc &&
    args.roomLifecycleLive &&
    Boolean(args.playbackUrl?.trim())
  );
}

/**
 * Suspend Stage WebRTC only when the app is truly backgrounded.
 * iOS notification banners / alerts flash `inactive` with sound — treating that as suspend
 * tore down buyer subscribe → video worked, then instant black.
 */
export function shouldSuspendLiveStageMedia(appState: AppStateStatus): boolean {
  return appState === 'background';
}

/**
 * Same as `shouldSuspendLiveStageMedia`, but never suspend while Stripe PaymentSheet /
 * confirmPayment has a commerce hold (Android reports `background` for that Activity).
 */
export function shouldSuspendLiveStageMediaWhileCommerceHold(
  appState: AppStateStatus,
  commerceHoldActive: boolean,
): boolean {
  if (commerceHoldActive) return false;
  return shouldSuspendLiveStageMedia(appState);
}

/**
 * Host publish: pause only on true background (home / app switcher), not on iOS `inactive`
 * (Control Center, notification banners, brief overlays). Background pause mirrors the Pause
 * button so buyers see Host Paused and the host avoids native Stage crashes on return.
 * Buyers still suspend subscribe via `shouldSuspendLiveStageMedia` to save battery.
 */
export function shouldSuspendHostStagePublish(appState: AppStateStatus): boolean {
  return appState === 'background';
}

/**
 * Host is on-air enough that leaving the app should become an intentional Pause
 * (even if the OS already dropped the publish socket).
 */
export function shouldHostBackgroundAutoPause(args: {
  appState: AppStateStatus;
  wentLive: boolean;
  intentionalStop: boolean;
  phase: 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
}): boolean {
  if (!shouldSuspendHostStagePublish(args.appState)) return false;
  if (!args.wentLive || args.intentionalStop) return false;
  return args.phase === 'live' || args.phase === 'paused';
}

/**
 * After leave-app pause, clear streamPaused for buyers only once Stage publish is back.
 * (PATCH false before publish leaves buyers off Host paused with a black feed.)
 */
export function shouldClearStreamPausedAfterHostResume(publishSucceeded: boolean): boolean {
  return publishSucceeded === true;
}

/**
 * Toolbar Play can show while phase is still `live` (stuck streamPaused after a PATCH race).
 * If we are already publishing, Play only needs to clear Host paused — not rejoin Stage.
 */
export function shouldTreatHostResumeAsAlreadyLive(args: {
  phase: 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
  publishing: boolean;
  intentionalPause: boolean;
}): boolean {
  return args.phase === 'live' && args.publishing && !args.intentionalPause;
}

/**
 * Play may be tapped whenever Host paused / remount idle / stuck live+unpublish.
 * Must not early-return false for phase `live` + streamPaused (that left buyers black).
 */
export function canAttemptHostResumeShow(args: {
  phase: 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
  publishing: boolean;
  intentionalPause: boolean;
}): boolean {
  if (shouldTreatHostResumeAsAlreadyLive(args)) return true;
  if (args.phase === 'paused' || args.phase === 'idle' || args.phase === 'starting') return true;
  // Live but not publishing (OS dropped publish) or still flagged intentional pause.
  return args.phase === 'live' && (!args.publishing || args.intentionalPause);
}

/**
 * TikTok / Whatnot / eBay pattern: Pause keeps the Stage session joined.
 * Warm Play = republish on the same session. Full leave+rejoin only after process death
 * (phase idle) or when warm republish fails.
 */
export function shouldPreferWarmHostResume(args: {
  phase: 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
  intentionalPause: boolean;
}): boolean {
  return args.intentionalPause && args.phase === 'paused';
}

/**
 * Toolbar Play/Resume must stay visible on live rooms even when Stage remounts idle
 * or cameraReady flickers (common on private shows after leave-app).
 */
export function shouldShowHostResumeControl(args: {
  roomStatus: 'scheduled' | 'live' | 'ended';
  phase: 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
  streamPaused?: boolean;
}): boolean {
  if (args.roomStatus !== 'live') return false;
  if (args.streamPaused) return true;
  return args.phase === 'paused' || args.phase === 'idle' || args.phase === 'starting';
}

/**
 * Unpublish during Pause / leave-app often fires native publish "failed".
 * Keep Host paused (Play) — never drop to idle + Retry (buyers black forever).
 */
export function shouldStayPausedAfterIntentionalUnpublish(intentionalPause: boolean): boolean {
  return intentionalPause === true;
}

/**
 * Whatnot invariant: while the room is live, Stage failures map to minimized + Resume —
 * never the pre-live idle Retry banner.
 */
export function shouldShowLiveResumeInsteadOfRetry(args: {
  roomStatus: 'scheduled' | 'live' | 'ended';
  broadcastPhase: 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
  hasBroadcastError: boolean;
}): boolean {
  if (args.roomStatus !== 'live') return false;
  if (args.broadcastPhase === 'idle') return true;
  if (args.hasBroadcastError && (args.broadcastPhase === 'paused' || args.broadcastPhase === 'starting')) {
    return true;
  }
  return false;
}

/** Pre-live Go Live Retry banner only when the room is not live yet. */
export function shouldShowPreLiveRetryBanner(args: {
  roomStatus: 'scheduled' | 'live' | 'ended';
  broadcastPhase: 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
  hasBroadcastError: boolean;
}): boolean {
  if (args.roomStatus === 'live') return false;
  if (!args.hasBroadcastError) return false;
  return args.broadcastPhase === 'idle' || args.broadcastPhase === 'starting';
}

/** @deprecated Use shouldWarmLiveHlsPipCompanion — warm player must exist before background. */
export function shouldAttachLiveHlsPipCompanion(appState: AppStateStatus): boolean {
  return appState === 'background';
}
