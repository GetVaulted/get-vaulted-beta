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
 * Do NOT start on `active → inactive` alone via this helper — use
 * `shouldPrepareLivePictureInPicture` for the early iOS home-gesture attempt.
 */
export function shouldAttemptLivePictureInPicture(
  next: AppStateStatus,
  previous: AppStateStatus,
): boolean {
  return next === 'background' && previous !== 'background';
}

/**
 * iOS home / app-switcher begins as `active → inactive`. Starting PiP here (debounced)
 * is required — waiting until `background` is often too late for AVPictureInPictureController.
 * Phone-call / Control Center also use `inactive`; callers must cancel if we return to `active`.
 */
export function shouldPrepareLivePictureInPicture(
  next: AppStateStatus,
  previous: AppStateStatus,
): boolean {
  return next === 'inactive' && previous === 'active';
}

/** True while the OS transition still allows startPictureInPicture (not back in foreground). */
export function isLivePictureInPictureAppState(state: AppStateStatus): boolean {
  return state === 'inactive' || state === 'background';
}

/**
 * Keep a hidden HLS player mounted while watching a WebRTC Stage stream so PiP can
 * attach the moment the user leaves the app. Must be warm *before* background.
 */
/** Retry PiP for several seconds — Stage→HLS composition can lag WebRTC by ~5–15s. */
export const LIVE_PIP_RETRY_DELAYS_MS = [0, 150, 400, 900, 1500, 2500, 4000, 6000] as const;

/**
 * After first paint, keep treating the stage as "live" for this long when frames briefly
 * drop — otherwise standby (dark overlay) flashes on every Stage remount / health flap.
 * Matches reconnect UI delay so buyers see one consistent grace window.
 */
export const LIVE_VIDEO_STICKY_MS = 1_800;

/** Sticky UI paint: real frames OR grace window after a brief gap. */
export function shouldUseStickyLiveVideoPaint(args: {
  videoHasData: boolean;
  stickyActive: boolean;
}): boolean {
  return args.videoHasData || args.stickyActive;
}

/**
 * Lift the warm HLS mirror above Stage while the native IVS surface is remounting or
 * briefly empty. Stage on top of a near-invisible HLS companion reads as a full black cut.
 */
export function shouldPromoteHlsOverStageDuringGap(args: {
  useWebrtc: boolean;
  webrtcReady: boolean;
  stageRemountCover: boolean;
  videoHasData: boolean;
}): boolean {
  if (!args.useWebrtc || !args.webrtcReady) return false;
  return args.stageRemountCover || !args.videoHasData;
}

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
 * Mute the HLS mirror under live Stage so buyers only hear WebRTC.
 * Unmute when backgrounded / Stage suspended so the OS window has audio
 * (never leave Stage + HLS both audible — that caused the delayed echo).
 *
 * `pipDismissedWhileBackgrounded` overrides everything else: once the buyer has explicitly
 * closed the OS PiP window (its native X) while the app is still backgrounded, there is no
 * surface left playing the video anywhere — `appBackgrounded` staying true must not be read as
 * "PiP is still showing, keep it audible." Without this, audio kept playing after PiP was closed.
 *
 * `pipActive` (native Stage remote PiP genuinely active — see `useStageRemotePictureInPicture`)
 * must NOT unmute the HLS mirror. Stage PiP already supplies its own audio via
 * `setStageAudioOutputEnabled`, so unmuting HLS here played the low-latency Stage feed and the
 * several-seconds-behind HLS mirror simultaneously — audible as garbled/choppy "echo" audio
 * while in the mini viewer, lingering briefly after returning to the app. Only fall through to
 * the HLS-surrogate unmute when Stage's own audio has been suspended (`stageSuspended`), i.e.
 * Stage is no longer the one providing audio.
 *
 * `usingStagePip` (pass `stagePipReady || stagePipActive`) closes a narrower version of the same
 * echo bug at the swipe-to-PiP moment itself: iOS reports `active → inactive` (which flips
 * `appBackgrounded` true here, pre-emptively, so PiP has time to start) before the native
 * `AVPictureInPictureController` actually reports `started` (`stagePipActive`). In that gap,
 * `pipActive` is still false but Stage audio is still very much live and unsuspended — without
 * this check, `appBackgrounded` alone fell through to the unmute branch below and the HLS mirror
 * briefly played alongside live Stage audio, an audible glitch right as the buyer swipes into the
 * mini viewer (and symmetrically for a moment on the way back, before `appBackgrounded` clears).
 * `stagePipReady` covers that gap since it's set as soon as the PiP controller is armed —
 * foreground, well before any background transition — and only clears on a genuine dismissal.
 */
export function shouldMuteHlsUnderLiveWebrtc(args: {
  webrtcReady: boolean;
  useWebrtc: boolean;
  stageSuspended: boolean;
  pipActive: boolean;
  appBackgrounded: boolean;
  pipDismissedWhileBackgrounded?: boolean;
  usingStagePip?: boolean;
}): boolean {
  if (args.pipDismissedWhileBackgrounded) return true;
  if (args.pipActive && !args.stageSuspended) return true;
  if (args.usingStagePip && !args.stageSuspended) return true;
  if (args.appBackgrounded || args.stageSuspended) return false;
  return args.webrtcReady && args.useWebrtc;
}

/** Mount the HLS VideoView for PiP even after Stage has painted over it. */
export function shouldShowHlsLayerForLivePip(args: {
  attachHls: boolean;
  playbackActive: boolean;
  surfaceError: boolean;
  webrtcReady: boolean;
  warmPipCompanion: boolean;
  pipActive: boolean;
  appBackgrounded: boolean;
}): boolean {
  if (!args.attachHls || !args.playbackActive || args.surfaceError) return false;
  if (!args.webrtcReady) return true;
  return args.warmPipCompanion || args.pipActive || args.appBackgrounded;
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
 * After this pause duration, Stage sockets / AWS composition are usually gone.
 * Prefer a cold leave+rejoin (fresh feed) over warm republish on a zombie session.
 * Matches pause AWS teardown (~45s) with a cushion for brief home-button pauses.
 */
export const HOST_WARM_RESUME_MAX_PAUSE_MS = 30_000;

/**
 * TikTok / Whatnot / eBay pattern: Pause keeps the Stage session joined.
 * Warm Play = republish on the same session — only while the pause was short.
 * Overnight / long Pause must cold rejoin so buyers get a restored feed even if
 * it is not the same Stage participant session that was cut.
 */
export function shouldPreferWarmHostResume(args: {
  phase: 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
  intentionalPause: boolean;
  /** ms since minimize / Pause; omit = treat as long (force cold). */
  pauseDurationMs?: number;
}): boolean {
  if (!args.intentionalPause || args.phase !== 'paused') return false;
  const duration = args.pauseDurationMs;
  if (duration == null || !Number.isFinite(duration)) return false;
  return duration < HOST_WARM_RESUME_MAX_PAUSE_MS;
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
 * Android only: a true app backgrounding (home / app-switcher, e.g. reading a text) tears
 * down the camera preview's native Surface — Android SurfaceView lifecycle, not an IVS bug.
 * The local camera stream object survives (`minimizeShow` never calls destroyLocalStreams),
 * so a normal warm/cold `resumeShow()` republishes on a stream still bound to that destroyed
 * Surface: `setStreamsPublished` succeeds and fires "published", but buyers see a frozen/black
 * feed until the app is force-closed (the only thing that fully releases the camera handle).
 *
 * A foreground Pause-button tap never leaves the Activity, so the Surface stays valid and
 * does NOT need this — only pause triggered by an actual backgrounding does. iOS camera
 * sessions survive backgrounding without losing their Surface, so this never applies there.
 */
export function shouldForceLocalStreamRefreshBeforeHostResume(args: {
  platform: 'ios' | 'android' | 'web' | 'windows' | 'macos';
  backgroundedWhilePaused: boolean;
}): boolean {
  return args.platform === 'android' && args.backgroundedWhilePaused === true;
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

/**
 * Native Stage PiP (expo-realtime-ivs-broadcast → IVSPictureInPictureController) state machine.
 * Mirrors the payload the native module actually emits — see
 * `ExpoRealtimeIvsBroadcast.types.ts` `PiPStateChangedPayload`.
 */
export type StagePipNativeState = 'started' | 'stopped' | 'restored';

/**
 * Distinguishes "user tapped the PiP window to return to the app" from "user tapped the PiP
 * window's own close (X) button" — using the actual native delegate callbacks, not AppState.
 *
 * On iOS, `AVPictureInPictureControllerDelegate` calls
 * `pictureInPictureController(_:restoreUserInterfaceForPictureInPictureStopWithCompletionHandler:)`
 * — surfaced here as the `'restored'` state — ONLY when the user taps the PiP window to restore
 * the app. That delegate method is never invoked when the user instead taps the window's own
 * close (X) button; only the unconditional `pictureInPictureControllerDidStopPictureInPicture`
 * (surfaced as `'stopped'`) fires in that case. Both fire, in that order, for a restore-tap; only
 * `'stopped'` fires alone for a real dismissal. `precededByRestore` is true only when a
 * `'restored'` event was seen immediately before this `'stopped'` event.
 */
export function isStagePipUserDismissal(args: {
  state: StagePipNativeState;
  precededByRestore: boolean;
}): boolean {
  return args.state === 'stopped' && !args.precededByRestore;
}

/**
 * Android's `PictureInPictureManager` fires the pair in the OPPOSITE order from iOS for a
 * restore-tap: `onActivityResumed` calls `onPictureInPictureModeChanged(false)` — emitting
 * `'stopped'` — and only then emits `'restored'` right after. `isStagePipUserDismissal`'s
 * look-back (`precededByRestore`) assumes iOS's order and misreads Android's leading `'stopped'`
 * as a dismissal, incorrectly killing video/audio on an ordinary restore-tap.
 *
 * Android can't classify a bare `'stopped'` by looking backward, so the hook holds it for
 * `ANDROID_STAGE_PIP_STOPPED_DEBOUNCE_MS` and looks forward instead: if `'restored'` arrives
 * within that window, the whole pair was a restore-tap, not a dismissal.
 */
export const ANDROID_STAGE_PIP_STOPPED_DEBOUNCE_MS = 200;

/**
 * Decision for the Android look-ahead above, once the debounce window has elapsed (or been
 * short-circuited by an incoming `'restored'`). Kept separate from the timer so the decision
 * itself is a pure, testable function — see `isStagePipUserDismissal` for the iOS equivalent.
 */
export function isAndroidStagePipStoppedADismissal(followedByRestoreWithinWindow: boolean): boolean {
  return !followedByRestoreWithinWindow;
}
