import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  addOnPiPErrorListener,
  addOnPiPStateChangedListener,
  disablePictureInPicture,
  enablePictureInPicture,
  isPictureInPictureSupported as isStagePictureInPictureSupported,
  startPictureInPicture as startStagePictureInPictureNative,
} from 'expo-realtime-ivs-broadcast';
import {
  ANDROID_STAGE_PIP_STOPPED_DEBOUNCE_MS,
  isAndroidStagePipStoppedADismissal,
  isLivePictureInPictureAppState,
  isStagePipUserDismissal,
  LIVE_PIP_RETRY_DELAYS_MS,
  shouldAttemptLivePictureInPicture,
  shouldPrepareLivePictureInPicture,
} from '../lib/livePlaybackAppState';
import { isLivePlaybackCommerceHoldActive } from '../lib/livePlaybackCommerceHold';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';

/**
 * Whatnot-style home-swipe PiP for IVS Stage (WebRTC) buyers.
 *
 * This uses the native remote-stream PiP built into expo-realtime-ivs-broadcast.
 * The previous HLS/expo-video surrogate cannot PiP the video buyers actually watch.
 */
export function useStageRemotePictureInPicture(args: {
  enabled: boolean;
  roomId: string;
}) {
  const [stagePipActive, setStagePipActive] = useState(false);
  const [stagePipReady, setStagePipReady] = useState(false);
  // True only when the user explicitly closed the OS PiP window's own X while backgrounded —
  // never true for a tap-to-return. See `isStagePipUserDismissal`. Consumers must react by
  // stopping playback/audio, then call `clearStagePipDismissed()`.
  const [stagePipDismissed, setStagePipDismissed] = useState(false);
  const enabledRef = useRef(args.enabled);
  enabledRef.current = args.enabled;
  const roomIdRef = useRef(args.roomId);
  roomIdRef.current = args.roomId;
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Tracks whether the most recent 'stopped' was immediately preceded by a 'restored' — the real
  // native signal for "user tapped to return" vs. "user tapped the window's own close (X)".
  // iOS only — Android fires the pair in the opposite order (see the Android refs below).
  const justRestoredRef = useRef(false);
  // Android only: PictureInPictureManager fires 'stopped' BEFORE 'restored' for a restore-tap
  // (opposite of iOS), so a bare 'stopped' can't be classified by looking backward. Hold it in
  // this debounce timer and look forward for a following 'restored' instead.
  const androidPendingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidStopFollowedByRestoreRef = useRef(false);

  const clearAndroidPendingStopTimer = useCallback(() => {
    if (androidPendingStopTimerRef.current != null) {
      clearTimeout(androidPendingStopTimerRef.current);
      androidPendingStopTimerRef.current = null;
    }
  }, []);

  const clearStagePipDismissed = useCallback(() => {
    setStagePipDismissed(false);
  }, []);

  const clearRetries = useCallback(() => {
    for (const t of retryTimersRef.current) clearTimeout(t);
    retryTimersRef.current = [];
  }, []);

  const startStagePictureInPicture = useCallback(async () => {
    if (!enabledRef.current) return;
    if (isLivePlaybackCommerceHoldActive()) {
      viewerLifecycleLog('stage_pip_skip_commerce_hold', { roomId: roomIdRef.current });
      return;
    }
    try {
      await startStagePictureInPictureNative();
      viewerLifecycleLog('stage_pip_start_requested', { roomId: roomIdRef.current });
    } catch (err) {
      viewerLifecycleLog('stage_pip_start_failed', {
        roomId: roomIdRef.current,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Enable native remote PiP as soon as Stage video is up.
  useEffect(() => {
    if (!args.enabled) {
      justRestoredRef.current = false;
      clearAndroidPendingStopTimer();
      androidStopFollowedByRestoreRef.current = false;
      setStagePipReady(false);
      setStagePipActive(false);
      setStagePipDismissed(false);
      void disablePictureInPicture().catch(() => {});
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      try {
        const supported = await isStagePictureInPictureSupported();
        if (cancelled) return;
        if (!supported) {
          viewerLifecycleLog('stage_pip_unsupported', { roomId: args.roomId });
          setStagePipReady(false);
          return;
        }
        const ok = await enablePictureInPicture({
          sourceView: 'remote',
          autoEnterOnBackground: true,
          preferredAspectRatio: { width: 9, height: 16 },
        });
        if (cancelled) return;
        setStagePipReady(Boolean(ok));
        viewerLifecycleLog('stage_pip_enabled', { roomId: args.roomId, ok: Boolean(ok) });
      } catch (err) {
        if (cancelled) return;
        setStagePipReady(false);
        viewerLifecycleLog('stage_pip_enable_failed', {
          roomId: args.roomId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    // Genuine dismissal (native X, not restore-tap). Disable the PiP controller FIRST — a prior
    // fix attempt deactivated the iOS audio session while the controller was still armed and
    // crashed in TestFlight (build 216). Disabling here fully tears the controller down before
    // any consumer touches AVAudioSession, and resets readiness so this session can't be
    // silently treated as "still using Stage PiP" downstream. Shared by both platforms' paths.
    const commitStagePipDismissal = () => {
      void disablePictureInPicture().catch(() => {});
      setStagePipReady(false);
      setStagePipDismissed(true);
      viewerLifecycleLog('stage_pip_dismissed', { roomId: roomIdRef.current });
    };

    const stateSub = addOnPiPStateChangedListener((event) => {
      const active = event.state === 'started' || event.state === 'restored';
      setStagePipActive(active);
      viewerLifecycleLog('stage_pip_state', { roomId: roomIdRef.current, state: event.state });

      if (event.state === 'restored') {
        if (Platform.OS === 'android') {
          // Android fires 'stopped' BEFORE 'restored' for a restore-tap (opposite of iOS) —
          // cancel the pending dismissal debounce below; this pair was a restore, not a dismissal.
          androidStopFollowedByRestoreRef.current = true;
          clearAndroidPendingStopTimer();
          return;
        }
        // iOS: 'stopped' fires immediately after this — must not be read as a dismissal.
        justRestoredRef.current = true;
        return;
      }
      if (event.state === 'started') {
        justRestoredRef.current = false;
        if (Platform.OS === 'android') clearAndroidPendingStopTimer();
        return;
      }

      // event.state === 'stopped'
      if (Platform.OS === 'android') {
        // Can't classify a bare 'stopped' by looking backward on Android — hold it and look
        // forward for a following 'restored' within the debounce window instead.
        androidStopFollowedByRestoreRef.current = false;
        clearAndroidPendingStopTimer();
        androidPendingStopTimerRef.current = setTimeout(() => {
          androidPendingStopTimerRef.current = null;
          if (isAndroidStagePipStoppedADismissal(androidStopFollowedByRestoreRef.current)) {
            commitStagePipDismissal();
          }
        }, ANDROID_STAGE_PIP_STOPPED_DEBOUNCE_MS);
        return;
      }

      const dismissed = isStagePipUserDismissal({
        state: 'stopped',
        precededByRestore: justRestoredRef.current,
      });
      justRestoredRef.current = false;
      if (!dismissed) return;
      commitStagePipDismissal();
    });
    const errorSub = addOnPiPErrorListener((event) => {
      viewerLifecycleLog('stage_pip_error', {
        roomId: roomIdRef.current,
        message: event.error,
      });
    });

    return () => {
      cancelled = true;
      stateSub.remove();
      errorSub.remove();
      justRestoredRef.current = false;
      clearAndroidPendingStopTimer();
      androidStopFollowedByRestoreRef.current = false;
      setStagePipReady(false);
      setStagePipActive(false);
      setStagePipDismissed(false);
      void disablePictureInPicture().catch(() => {});
    };
  }, [args.enabled, args.roomId, clearAndroidPendingStopTimer]);

  // Home swipe: native autoEnter should fire; also manually start with retries.
  useEffect(() => {
    if (!args.enabled || !stagePipReady) {
      clearRetries();
      return undefined;
    }

    const attempt = () => {
      clearRetries();
      for (const delayMs of LIVE_PIP_RETRY_DELAYS_MS) {
        const timer = setTimeout(() => {
          if (!isLivePictureInPictureAppState(prevAppStateRef.current)) return;
          if (!enabledRef.current) return;
          void startStagePictureInPicture();
        }, delayMs);
        retryTimersRef.current.push(timer);
      }
    };

    const sub = AppState.addEventListener('change', (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;

      if (shouldPrepareLivePictureInPicture(next, prev)) {
        void startStagePictureInPicture();
        attempt();
        return;
      }
      if (shouldAttemptLivePictureInPicture(next, prev)) {
        void startStagePictureInPicture();
        attempt();
        return;
      }
      if (next === 'active') {
        clearRetries();
      }
    });

    return () => {
      clearRetries();
      sub.remove();
    };
  }, [args.enabled, stagePipReady, clearRetries, startStagePictureInPicture]);

  return {
    stagePipReady,
    stagePipActive,
    /** True only when the user explicitly closed the OS PiP window's own X while backgrounded. */
    stagePipDismissed,
    /** Call once the consumer has finished tearing down playback/audio for a dismissal. */
    clearStagePipDismissed,
    startStagePictureInPicture,
  };
}
