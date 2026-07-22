import type { AppStateStatus } from 'react-native';

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

/** @deprecated Use shouldWarmLiveHlsPipCompanion — warm player must exist before background. */
export function shouldAttachLiveHlsPipCompanion(appState: AppStateStatus): boolean {
  return appState === 'background';
}
