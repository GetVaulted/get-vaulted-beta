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
 * tore down buyer subscribe (and host publish) → video worked, then instant black.
 */
export function shouldSuspendLiveStageMedia(appState: AppStateStatus): boolean {
  return appState === 'background';
}

/** Host publish uses the same rule as buyer subscribe (background only). */
export function shouldSuspendHostStagePublish(appState: AppStateStatus): boolean {
  return shouldSuspendLiveStageMedia(appState);
}

/** @deprecated Use shouldWarmLiveHlsPipCompanion — warm player must exist before background. */
export function shouldAttachLiveHlsPipCompanion(appState: AppStateStatus): boolean {
  return appState === 'background';
}
