import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  addOnPublishStateChangedListener,
  addOnStageConnectionStateChangedListener,
  addOnStageErrorListener,
  destroyLocalStreams,
  initializeLocalStreams,
  joinStage,
  leaveStage,
  requestPermissions,
  setMicrophoneMuted,
  setStreamsPublished,
  swapCamera,
} from 'expo-realtime-ivs-broadcast';
import { endHostStageSession, requestHostStageToken } from '../api/liveRoomStreamRepository';
import { isStageWebrtcEnabled } from '../lib/liveStreamPlayback';
import { shouldSuspendLiveStageMedia } from '../lib/livePlaybackAppState';
import {
  cameraPermissionDeniedMessage,
  cameraPermissionUnavailableMessage,
  SELLER_DEFAULT_CAMERA_FACING,
  type SellerCameraFacing,
} from '../lib/sellerHostCamera';
import { ensureStageSdkInitialized } from '../lib/stageSdk';

export type MobileHostBroadcastPhase = 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
export type SellerCameraPermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

function friendlyPublishError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/permission|denied|not allowed/i.test(msg)) {
    return cameraPermissionDeniedMessage();
  }
  if (/not found|no camera|no microphone/i.test(msg)) {
    return cameraPermissionUnavailableMessage();
  }
  if (msg.trim()) return msg;
  return 'Could not start the live broadcast.';
}

/**
 * Seller IVS Stage publisher with persistent pre-live rear-camera preview.
 * Preview starts on mount; Go Live reuses the same local streams (no re-init to front).
 */
export function useMobileStagePublish(args: {
  roomId: string;
  accessToken: string;
  /** When true, request permissions and start the rear-camera preview. */
  previewEnabled: boolean;
  onBroadcastStarted?: () => void;
  onStreamRefresh?: () => void;
}) {
  const startInFlightRef = useRef(false);
  const wentLiveRef = useRef(false);
  const publishingRef = useRef(false);
  const localStreamsReadyRef = useRef(false);
  const rearDefaultAppliedRef = useRef(false);
  const previewInitInFlightRef = useRef(false);
  const listenerSubsRef = useRef<Array<{ remove: () => void }>>([]);
  const phaseRef = useRef<MobileHostBroadcastPhase>('idle');
  const interruptedPublishRef = useRef(false);
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState<MobileHostBroadcastPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [localPreviewReady, setLocalPreviewReady] = useState(false);
  const [permissionState, setPermissionState] = useState<SellerCameraPermissionState>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<SellerCameraFacing>(SELLER_DEFAULT_CAMERA_FACING);
  const [microphoneMuted, setMicrophoneMutedState] = useState(false);

  const cbRef = useRef(args);
  cbRef.current = args;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        if (!interruptedPublishRef.current) return;
        interruptedPublishRef.current = false;
        const currentPhase = phaseRef.current;
        if (currentPhase !== 'live' && currentPhase !== 'paused') return;
        void (async () => {
          try {
            await setStreamsPublished(true);
            if (!mountedRef.current) return;
            publishingRef.current = true;
            setPhase('live');
          } catch {
            /* call or another app may still hold the mic */
          }
        })();
        return;
      }

      if (!shouldSuspendLiveStageMedia(next)) return;
      if (!publishingRef.current && phaseRef.current !== 'live') return;

      interruptedPublishRef.current = true;
      publishingRef.current = false;
      void setStreamsPublished(false).catch(() => {
        /* ignore — releasing the mic avoids native crashes during phone calls */
      });
      if (phaseRef.current === 'live' && mountedRef.current) {
        setPhase('paused');
      }
    });
    return () => sub.remove();
  }, []);

  const clearStageListeners = useCallback(() => {
    for (const sub of listenerSubsRef.current) {
      sub.remove();
    }
    listenerSubsRef.current = [];
  }, []);

  const teardownStageConnection = useCallback(async () => {
    clearStageListeners();
    publishingRef.current = false;
    try {
      await setStreamsPublished(false);
    } catch {
      /* ignore */
    }
    try {
      await leaveStage();
    } catch {
      /* ignore */
    }
  }, [clearStageListeners]);

  const releaseLocalDevices = useCallback(async () => {
    await teardownStageConnection();
    try {
      await destroyLocalStreams();
    } catch {
      /* ignore */
    }
    localStreamsReadyRef.current = false;
    rearDefaultAppliedRef.current = false;
    if (mountedRef.current) {
      setLocalPreviewReady(false);
      setCameraFacing(SELLER_DEFAULT_CAMERA_FACING);
      setMicrophoneMutedState(false);
      setPermissionState('idle');
    }
    try {
      await setMicrophoneMuted(false);
    } catch {
      /* ignore */
    }
  }, [teardownStageConnection]);

  const endServerSession = useCallback(async () => {
    if (!cbRef.current.accessToken.trim()) return;
    try {
      await endHostStageSession(cbRef.current.roomId, cbRef.current.accessToken);
    } catch {
      /* best-effort */
    }
  }, []);

  const applyDefaultRearCamera = useCallback(async () => {
    if (rearDefaultAppliedRef.current) return;
    await swapCamera();
    rearDefaultAppliedRef.current = true;
    setCameraFacing(SELLER_DEFAULT_CAMERA_FACING);
  }, []);

  const ensureLocalPreview = useCallback(async (): Promise<boolean> => {
    if (!isStageWebrtcEnabled()) return false;
    if (localStreamsReadyRef.current) return true;
    if (previewInitInFlightRef.current) return false;

    previewInitInFlightRef.current = true;
    setPermissionState('requesting');
    setPermissionError(null);
    setError(null);

    try {
      await ensureStageSdkInitialized('studio');
      const perms = await requestPermissions();
      if (perms.camera === 'unavailable' || perms.microphone === 'unavailable') {
        setPermissionState('unavailable');
        setPermissionError(cameraPermissionUnavailableMessage());
        return false;
      }
      if (perms.camera === 'denied' || perms.microphone === 'denied') {
        setPermissionState('denied');
        setPermissionError(cameraPermissionDeniedMessage());
        return false;
      }

      await initializeLocalStreams();
      await applyDefaultRearCamera();

      localStreamsReadyRef.current = true;
      setLocalPreviewReady(true);
      setPermissionState('granted');
      return true;
    } catch (err) {
      const msg = friendlyPublishError(err);
      if (/permission|denied/i.test(msg)) {
        setPermissionState('denied');
        setPermissionError(msg);
      } else {
        setPermissionState('unavailable');
        setPermissionError(msg);
      }
      return false;
    } finally {
      previewInitInFlightRef.current = false;
    }
  }, [applyDefaultRearCamera]);

  useEffect(() => {
    if (!args.previewEnabled) return;
    const frame = requestAnimationFrame(() => {
      void ensureLocalPreview();
    });
    return () => cancelAnimationFrame(frame);
  }, [args.previewEnabled, ensureLocalPreview]);

  useEffect(() => {
    return () => {
      void releaseLocalDevices();
    };
  }, [releaseLocalDevices]);

  const retryPreviewPermission = useCallback(async () => {
    localStreamsReadyRef.current = false;
    rearDefaultAppliedRef.current = false;
    setLocalPreviewReady(false);
    setPermissionState('idle');
    setPermissionError(null);
    try {
      await destroyLocalStreams();
    } catch {
      /* ignore */
    }
    await ensureLocalPreview();
  }, [ensureLocalPreview]);

  const flipCamera = useCallback(async () => {
    if (!localStreamsReadyRef.current) return;
    try {
      await swapCamera();
      setCameraFacing((prev) => (prev === 'front' ? 'back' : 'front'));
    } catch (err) {
      setError(friendlyPublishError(err));
    }
  }, []);

  const toggleMicrophoneMute = useCallback(async () => {
    if (!localStreamsReadyRef.current) return;
    const next = !microphoneMuted;
    try {
      await setMicrophoneMuted(next);
      setMicrophoneMutedState(next);
    } catch (err) {
      setError(friendlyPublishError(err));
    }
  }, [microphoneMuted]);

  const start = useCallback(async () => {
    if (!isStageWebrtcEnabled()) {
      setError('Real-Time streaming is disabled in this build.');
      return;
    }
    if (startInFlightRef.current || publishingRef.current) return;
    if (!cbRef.current.accessToken.trim()) {
      setError('Sign in to start broadcasting.');
      return;
    }

    const previewOk = localStreamsReadyRef.current || (await ensureLocalPreview());
    if (!previewOk) {
      setError(permissionError ?? cameraPermissionDeniedMessage());
      return;
    }

    startInFlightRef.current = true;
    wentLiveRef.current = false;
    setPhase('starting');
    setError(null);

    const markLive = () => {
      if (wentLiveRef.current) return;
      wentLiveRef.current = true;
      publishingRef.current = true;
      setPhase('live');
      void cbRef.current.onBroadcastStarted?.();
      cbRef.current.onStreamRefresh?.();
    };

    try {
      const tokenPayload = await requestHostStageToken(cbRef.current.roomId, cbRef.current.accessToken);

      const connSub = addOnStageConnectionStateChangedListener((evt) => {
        if (evt.state === 'connected' && !evt.error) {
          markLive();
        }
      });

      const pubSub = addOnPublishStateChangedListener((evt) => {
        if (evt.state === 'published') markLive();
        if (evt.state === 'failed') {
          setError(evt.error || 'Publish failed.');
          setPhase('idle');
          publishingRef.current = false;
          void teardownStageConnection();
          void endServerSession();
        }
      });

      const errSub = addOnStageErrorListener((evt) => {
        if (!evt.isFatal || !publishingRef.current) return;
        setError(evt.description || `stage_error_${evt.code}`);
        setPhase('idle');
        publishingRef.current = false;
        void teardownStageConnection();
        void endServerSession();
      });

      listenerSubsRef.current = [connSub, pubSub, errSub];

      await joinStage(tokenPayload.token);
      await setStreamsPublished(true);
    } catch (err) {
      await teardownStageConnection();
      await endServerSession();
      setPhase('idle');
      setError(friendlyPublishError(err));
    } finally {
      startInFlightRef.current = false;
    }
  }, [ensureLocalPreview, endServerSession, permissionError, teardownStageConnection]);

  /** Stop publishing to buyers; keep local preview for the seller. */
  const stop = useCallback(async () => {
    setPhase((prev) => (prev === 'live' || prev === 'starting' || prev === 'paused' ? 'stopping' : prev));
    if (!publishingRef.current && phase === 'idle') return;
    setError(null);
    await teardownStageConnection();
    try {
      await endServerSession();
      cbRef.current.onStreamRefresh?.();
    } catch (err) {
      setError(friendlyPublishError(err));
    } finally {
      wentLiveRef.current = false;
      interruptedPublishRef.current = false;
      setPhase('idle');
    }
  }, [endServerSession, phase, teardownStageConnection]);

  /** Pause video/audio to buyers while keeping the stage session warm. */
  const pause = useCallback(async () => {
    if (phase !== 'live' || !publishingRef.current) return;
    setError(null);
    try {
      await setStreamsPublished(false);
      publishingRef.current = false;
      setPhase('paused');
    } catch (err) {
      setError(friendlyPublishError(err));
    }
  }, [phase]);

  /** Resume publishing after a pause. */
  const resume = useCallback(async () => {
    if (phase !== 'paused') return;
    setError(null);
    try {
      await setStreamsPublished(true);
      publishingRef.current = true;
      setPhase('live');
    } catch (err) {
      setError(friendlyPublishError(err));
    }
  }, [phase]);

  /** End show — fully release camera/mic hardware. */
  const releaseCamera = useCallback(async () => {
    if (publishingRef.current || phase === 'live' || phase === 'paused' || phase === 'starting') {
      await stop();
    }
    await releaseLocalDevices();
  }, [phase, releaseLocalDevices, stop]);

  return {
    phase,
    error,
    localPreviewReady,
    permissionState,
    permissionError,
    cameraFacing,
    start,
    stop,
    pause,
    resume,
    releaseCamera,
    flipCamera,
    toggleMicrophoneMute,
    microphoneMuted,
    retryPreviewPermission,
    isPublishing: phase === 'live' || phase === 'starting' || phase === 'paused',
  };
}
