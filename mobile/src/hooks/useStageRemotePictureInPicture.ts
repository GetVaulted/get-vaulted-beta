import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  addOnPiPErrorListener,
  addOnPiPStateChangedListener,
  disablePictureInPicture,
  enablePictureInPicture,
  isPictureInPictureSupported as isStagePictureInPictureSupported,
  startPictureInPicture as startStagePictureInPictureNative,
} from 'expo-realtime-ivs-broadcast';
import {
  isLivePictureInPictureAppState,
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
  const enabledRef = useRef(args.enabled);
  enabledRef.current = args.enabled;
  const roomIdRef = useRef(args.roomId);
  roomIdRef.current = args.roomId;
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const retryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
      setStagePipReady(false);
      setStagePipActive(false);
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

    const stateSub = addOnPiPStateChangedListener((event) => {
      const active = event.state === 'started' || event.state === 'restored';
      setStagePipActive(active);
      viewerLifecycleLog('stage_pip_state', { roomId: roomIdRef.current, state: event.state });
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
      setStagePipReady(false);
      setStagePipActive(false);
      void disablePictureInPicture().catch(() => {});
    };
  }, [args.enabled, args.roomId]);

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
    startStagePictureInPicture,
  };
}
