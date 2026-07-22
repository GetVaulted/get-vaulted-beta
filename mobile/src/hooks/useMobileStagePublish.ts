import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  addOnPublishStateChangedListener,
  addOnStageErrorListener,
  destroyLocalStreams,
  initializeLocalStreams,
  joinStage,
  leaveStage,
  getSupportedCameraZoomStops,
  requestPermissions,
  setCameraZoom as nativeSetCameraZoom,
  setMicrophoneMuted,
  setStreamsPublished,
  swapCamera,
} from 'expo-realtime-ivs-broadcast';
import {
  endHostStageSession,
  refreshHostStageToken,
  requestHostStageToken,
} from '../api/liveRoomStreamRepository';
import { isStageWebrtcEnabled } from '../lib/liveStreamPlayback';
import { shouldHostBackgroundAutoPause } from '../lib/livePlaybackAppState';
import {
  cameraPermissionDeniedMessage,
  cameraPermissionUnavailableMessage,
  SELLER_DEFAULT_CAMERA_FACING,
  type SellerCameraFacing,
} from '../lib/sellerHostCamera';
import { withIvsStageSerialized } from '../lib/ivsStageGate';
import { ensureStageSdkInitialized } from '../lib/stageSdk';

export type MobileHostBroadcastPhase = 'idle' | 'starting' | 'live' | 'paused' | 'stopping';
export type SellerCameraPermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

/** Refresh before server host TTL expires (720 min). Fallback if expiresInSeconds missing. */
const HOST_TOKEN_REFRESH_LEAD_MS = 60 * 60 * 1000;
const HOST_TOKEN_REFRESH_FALLBACK_MS = 11 * 60 * 60 * 1000;
/** Soft cap per reconnect burst — after this we wait and keep looping while still live. */
const HOST_MAX_REJOIN_ATTEMPTS = 8;
const HOST_REJOIN_LOOP_DELAY_MS = 5_000;

function hostTokenRefreshDelayMs(expiresInSeconds: number): number {
  if (expiresInSeconds > 0) {
    return Math.max(60_000, expiresInSeconds * 1000 - HOST_TOKEN_REFRESH_LEAD_MS);
  }
  return HOST_TOKEN_REFRESH_FALLBACK_MS;
}

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
  /**
   * Fired when the host app backgrounds while live — host should PATCH streamPaused=true
   * so buyers see "Host paused" (same as the Pause button).
   * May return a Promise; foreground re-fire awaits it so the DB catches up before Play.
   */
  onBackgroundAutoPause?: () => void | Promise<void>;
}) {
  const startInFlightRef = useRef(false);
  const wentLiveRef = useRef(false);
  const publishingRef = useRef(false);
  const localStreamsReadyRef = useRef(false);
  const rearDefaultAppliedRef = useRef(false);
  const previewInitInFlightRef = useRef(false);
  /** Shared preview init so concurrent Go Live / Retry await the same work instead of bailing. */
  const previewInitPromiseRef = useRef<Promise<boolean> | null>(null);
  /** Shared start promise so Retry doesn't silent-return while a start is in flight. */
  const startPromiseRef = useRef<Promise<boolean> | null>(null);
  const listenerSubsRef = useRef<Array<{ remove: () => void }>>([]);
  const phaseRef = useRef<MobileHostBroadcastPhase>('idle');
  const interruptedPublishRef = useRef(false);
  const mountedRef = useRef(true);
  const intentionalStopRef = useRef(false);
  /** Pause button or app-background pause — stay paused until host taps Resume. */
  const intentionalPauseRef = useRef(false);
  const reconnectInFlightRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  /** Bumped to cancel stale reconnect/AppState timers after stop / failed start / Retry. */
  const reconnectEpochRef = useRef(0);
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectPublishRef = useRef<(trigger: string) => void>(() => {});

  const bumpReconnectEpoch = useCallback(() => {
    reconnectEpochRef.current += 1;
  }, []);

  const canAutoRecoverPublish = useCallback(() => {
    if (!mountedRef.current || intentionalStopRef.current || !wentLiveRef.current) return false;
    if (intentionalPauseRef.current) return false;
    if (startInFlightRef.current || startPromiseRef.current || reconnectInFlightRef.current) return false;
    const p = phaseRef.current;
    return p === 'live' || p === 'paused';
  }, []);

  const [phase, setPhase] = useState<MobileHostBroadcastPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [localPreviewReady, setLocalPreviewReady] = useState(false);
  const [permissionState, setPermissionState] = useState<SellerCameraPermissionState>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<SellerCameraFacing>(SELLER_DEFAULT_CAMERA_FACING);
  const [cameraZoom, setCameraZoomState] = useState<number>(1);
  const [zoomStops, setZoomStops] = useState<number[]>([1]);
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
      // True background (home / app switcher): pause like the Pause button. Do NOT pause on
      // iOS `inactive` alone — that is Control Center / banners and used to black out buyers.
      if (
        shouldHostBackgroundAutoPause({
          appState: next,
          wentLive: wentLiveRef.current,
          intentionalStop: intentionalStopRef.current,
          phase: phaseRef.current,
        })
      ) {
        const alreadyPaused = intentionalPauseRef.current && phaseRef.current === 'paused';
        intentionalPauseRef.current = true;
        interruptedPublishRef.current = true;
        bumpReconnectEpoch();
        publishingRef.current = false;
        if (mountedRef.current) setPhase('paused');

        // Signal buyers FIRST — iOS often kills network after unpublish/background settles.
        void Promise.resolve()
          .then(() => cbRef.current.onBackgroundAutoPause?.())
          .catch(() => {
            /* best-effort buyer Host Paused signal */
          });

        if (!alreadyPaused) {
          void withIvsStageSerialized(async () => {
            await setStreamsPublished(false);
          }).catch(() => {
            /* releasing publish avoids native Stage crashes when backgrounded */
          });
        }
        return;
      }

      if (next !== 'active') return;
      // Intentional Pause (button or background) stays paused until the host taps Resume.
      // Re-fire + await buyer Host paused — background PATCH is frequently killed mid-flight on iOS.
      if (intentionalPauseRef.current || (phaseRef.current === 'paused' && !publishingRef.current)) {
        if (intentionalPauseRef.current) {
          if (mountedRef.current) setPhase('paused');
          void (async () => {
            try {
              await cbRef.current.onBackgroundAutoPause?.();
            } catch {
              /* best-effort */
            }
          })();
        }
        return;
      }
      if (!canAutoRecoverPublish()) return;

      const epoch = reconnectEpochRef.current;
      void (async () => {
        const delays = [0, 400, 1200, 2500, 5000];
        for (const delayMs of delays) {
          if (delayMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          }
          if (epoch !== reconnectEpochRef.current || !canAutoRecoverPublish()) return;
          if (intentionalPauseRef.current) return;
          if (phaseRef.current === 'paused' && !publishingRef.current) return;
          try {
            await withIvsStageSerialized(async () => {
              await setStreamsPublished(true);
            });
            if (epoch !== reconnectEpochRef.current || !mountedRef.current) return;
            publishingRef.current = true;
            interruptedPublishRef.current = false;
            reconnectAttemptsRef.current = 0;
            if (phaseRef.current !== 'paused') {
              setPhase('live');
              setError(null);
            }
            return;
          } catch {
            /* OS may have torn Stage down — fall through to full rejoin */
          }
        }
        if (epoch === reconnectEpochRef.current && canAutoRecoverPublish() && !intentionalPauseRef.current) {
          reconnectPublishRef.current('app_resume');
        }
      })();
    });
    return () => sub.remove();
  }, [bumpReconnectEpoch, canAutoRecoverPublish]);

  const clearTokenRefreshTimer = useCallback(() => {
    if (tokenRefreshTimerRef.current != null) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback(
    (expiresInSeconds: number) => {
      clearTokenRefreshTimer();
      const delayMs = hostTokenRefreshDelayMs(expiresInSeconds);
      tokenRefreshTimerRef.current = setTimeout(() => {
        if (!wentLiveRef.current || intentionalStopRef.current || intentionalPauseRef.current) return;
        reconnectPublishRef.current('token_refresh');
      }, delayMs);
    },
    [clearTokenRefreshTimer],
  );

  const clearStageListeners = useCallback(() => {
    for (const sub of listenerSubsRef.current) {
      sub.remove();
    }
    listenerSubsRef.current = [];
  }, []);

  const teardownStageConnection = useCallback(async () => {
    await withIvsStageSerialized(async () => {
      clearTokenRefreshTimer();
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
    });
  }, [clearStageListeners, clearTokenRefreshTimer]);

  const releaseLocalDevices = useCallback(async () => {
    intentionalStopRef.current = true;
    intentionalPauseRef.current = false;
    await withIvsStageSerialized(async () => {
      clearTokenRefreshTimer();
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
    });
  }, [clearStageListeners, clearTokenRefreshTimer]);

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
    if (previewInitPromiseRef.current) return previewInitPromiseRef.current;

    const run = (async (): Promise<boolean> => {
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

        await withIvsStageSerialized(async () => {
          await initializeLocalStreams();
          await applyDefaultRearCamera();
        });

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
    })();

    previewInitPromiseRef.current = run;
    try {
      return await run;
    } finally {
      if (previewInitPromiseRef.current === run) {
        previewInitPromiseRef.current = null;
      }
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
    // Wait out any in-flight init so we don't destroy streams mid-setup then bail.
    if (previewInitPromiseRef.current) {
      await previewInitPromiseRef.current.catch(() => false);
    }
    localStreamsReadyRef.current = false;
    rearDefaultAppliedRef.current = false;
    setLocalPreviewReady(false);
    setPermissionState('requesting');
    setPermissionError(null);
    await withIvsStageSerialized(async () => {
      try {
        await destroyLocalStreams();
      } catch {
        /* ignore */
      }
    });
    await ensureLocalPreview();
  }, [ensureLocalPreview]);

  const refreshZoomStops = useCallback(async () => {
    if (!localStreamsReadyRef.current) return;
    try {
      const stops = await getSupportedCameraZoomStops();
      const clean = Array.isArray(stops)
        ? stops.filter((s) => typeof s === 'number' && Number.isFinite(s) && s > 0)
        : [];
      setZoomStops(clean.length ? Array.from(new Set(clean)).sort((a, b) => a - b) : [1]);
    } catch {
      setZoomStops([1]);
    }
  }, []);

  const setCameraZoom = useCallback(async (factor: number) => {
    if (!localStreamsReadyRef.current) return;
    try {
      const applied = await nativeSetCameraZoom(factor);
      if (applied) setCameraZoomState(factor);
    } catch (err) {
      setError(friendlyPublishError(err));
    }
  }, []);

  const flipCamera = useCallback(async () => {
    if (!localStreamsReadyRef.current) return;
    try {
      await swapCamera();
      setCameraFacing((prev) => (prev === 'front' ? 'back' : 'front'));
      // Zoom resets to 1x on a lens/position swap; refresh the supported stops for the new camera.
      setCameraZoomState(1);
      void refreshZoomStops();
    } catch (err) {
      setError(friendlyPublishError(err));
    }
  }, [refreshZoomStops]);

  useEffect(() => {
    if (localPreviewReady) void refreshZoomStops();
  }, [localPreviewReady, refreshZoomStops]);

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

  const attachPublishListeners = useCallback(
    (opts: { onFirstLive: () => void; allowReconnect: boolean }) => {
      clearStageListeners();

      // Do NOT mark live on Stage "connected" — that fires before publish and left wentLiveRef
      // stuck true when setStreamsPublished failed (Retry banner + reconnect crash).
      const pubSub = addOnPublishStateChangedListener((evt) => {
        if (evt.state === 'published') {
          opts.onFirstLive();
          return;
        }
        if (evt.state === 'failed') {
          // Still joining Go Live — let start()'s catch clear state; do not reconnect yet.
          if (startInFlightRef.current || !wentLiveRef.current) {
            if (!startInFlightRef.current) {
              setError(evt.error || 'Publish failed.');
              setPhase('idle');
              publishingRef.current = false;
              void teardownStageConnection();
              void endServerSession();
            }
            return;
          }
          if (opts.allowReconnect && !intentionalStopRef.current && !intentionalPauseRef.current) {
            reconnectPublishRef.current('publish_failed');
            return;
          }
          setError(evt.error || 'Publish failed.');
          setPhase('idle');
          publishingRef.current = false;
          wentLiveRef.current = false;
          bumpReconnectEpoch();
          void teardownStageConnection();
          void endServerSession();
        }
      });

      const errSub = addOnStageErrorListener((evt) => {
        if (!evt.isFatal) return;
        if (startInFlightRef.current || !wentLiveRef.current) {
          if (!startInFlightRef.current && (publishingRef.current || wentLiveRef.current)) {
            setError(evt.description || `stage_error_${evt.code}`);
            setPhase('idle');
            publishingRef.current = false;
            wentLiveRef.current = false;
            bumpReconnectEpoch();
            void teardownStageConnection();
            void endServerSession();
          }
          return;
        }
        if (opts.allowReconnect && !intentionalStopRef.current && !intentionalPauseRef.current) {
          reconnectPublishRef.current(`stage_error_${evt.code}`);
          return;
        }
        setError(evt.description || `stage_error_${evt.code}`);
        setPhase('idle');
        publishingRef.current = false;
        wentLiveRef.current = false;
        bumpReconnectEpoch();
        void teardownStageConnection();
        void endServerSession();
      });

      listenerSubsRef.current = [pubSub, errSub];
    },
    [bumpReconnectEpoch, clearStageListeners, endServerSession, teardownStageConnection],
  );

  const reconnectPublish = useCallback(
    async (trigger: string) => {
      if (
        reconnectInFlightRef.current ||
        intentionalStopRef.current ||
        intentionalPauseRef.current ||
        !wentLiveRef.current ||
        startInFlightRef.current ||
        startPromiseRef.current
      ) {
        return;
      }
      if (phaseRef.current !== 'live' && phaseRef.current !== 'paused' && phaseRef.current !== 'starting') {
        return;
      }
      // Never auto-rejoin while the host intentionally paused (button or background).
      if (phaseRef.current === 'paused' && !publishingRef.current) {
        return;
      }

      const epoch = reconnectEpochRef.current;

      if (reconnectAttemptsRef.current >= HOST_MAX_REJOIN_ATTEMPTS) {
        if (mountedRef.current) {
          setError('Reconnecting to live…');
          // Stay "live" intent — never park on paused unless the host tapped Pause.
          if (phaseRef.current !== 'paused') setPhase('starting');
        }
        publishingRef.current = false;
        setTimeout(() => {
          if (epoch !== reconnectEpochRef.current) return;
          if (!intentionalStopRef.current && wentLiveRef.current && !startInFlightRef.current) {
            reconnectAttemptsRef.current = 0;
            reconnectPublishRef.current('rejoin_loop');
          }
        }, HOST_REJOIN_LOOP_DELAY_MS);
        return;
      }

      reconnectInFlightRef.current = true;
      reconnectAttemptsRef.current += 1;
      clearTokenRefreshTimer();
      if (mountedRef.current && phaseRef.current !== 'paused') {
        setPhase('starting');
        setError(null);
      }

      try {
        await withIvsStageSerialized(async () => {
          clearStageListeners();
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
        });

        if (
          epoch !== reconnectEpochRef.current ||
          intentionalStopRef.current ||
          !mountedRef.current ||
          !wentLiveRef.current
        ) {
          return;
        }

        const tokenPayload = await refreshHostStageToken(
          cbRef.current.roomId,
          cbRef.current.accessToken,
        );

        if (epoch !== reconnectEpochRef.current || intentionalStopRef.current || !wentLiveRef.current) {
          return;
        }

        attachPublishListeners({
          onFirstLive: () => {
            reconnectAttemptsRef.current = 0;
            publishingRef.current = true;
            if (mountedRef.current) {
              setPhase('live');
              setError(null);
            }
            scheduleTokenRefresh(tokenPayload.expiresInSeconds);
            cbRef.current.onStreamRefresh?.();
          },
          allowReconnect: true,
        });

        await withIvsStageSerialized(async () => {
          await joinStage(tokenPayload.token);
          await setStreamsPublished(true);
        });

        if (epoch !== reconnectEpochRef.current || intentionalStopRef.current || !wentLiveRef.current) {
          return;
        }

        publishingRef.current = true;
        reconnectAttemptsRef.current = 0;
        if (mountedRef.current) {
          setPhase('live');
          setError(null);
        }
        scheduleTokenRefresh(tokenPayload.expiresInSeconds);
        cbRef.current.onStreamRefresh?.();
      } catch (err) {
        if (epoch !== reconnectEpochRef.current || intentionalStopRef.current || !wentLiveRef.current) {
          return;
        }
        if (reconnectAttemptsRef.current >= HOST_MAX_REJOIN_ATTEMPTS) {
          if (mountedRef.current) {
            setError(friendlyPublishError(err) || 'Reconnecting to live…');
            if (phaseRef.current !== 'paused') setPhase('starting');
          }
          publishingRef.current = false;
          setTimeout(() => {
            if (epoch !== reconnectEpochRef.current) return;
            if (!intentionalStopRef.current && wentLiveRef.current && !startInFlightRef.current) {
              reconnectAttemptsRef.current = 0;
              reconnectPublishRef.current('rejoin_loop');
            }
          }, HOST_REJOIN_LOOP_DELAY_MS);
        } else {
          const delay = 1_500;
          setTimeout(() => {
            if (epoch !== reconnectEpochRef.current) return;
            if (!intentionalStopRef.current && wentLiveRef.current && !startInFlightRef.current) {
              reconnectPublishRef.current(
                trigger.startsWith('retry_') || trigger.includes('token_refresh')
                  ? trigger
                  : `retry_${trigger}`,
              );
            }
          }, delay);
        }
      } finally {
        reconnectInFlightRef.current = false;
      }
    },
    [attachPublishListeners, clearStageListeners, clearTokenRefreshTimer, scheduleTokenRefresh],
  );

  reconnectPublishRef.current = (trigger: string) => {
    void reconnectPublish(trigger);
  };

  // Keepalive: if the OS silently drops publish while the host stays in-room, nudge it back.
  useEffect(() => {
    if (phase !== 'live') return undefined;
    const id = setInterval(() => {
      if (!canAutoRecoverPublish() || phaseRef.current !== 'live') return;
      const epoch = reconnectEpochRef.current;
      void withIvsStageSerialized(async () => {
        await setStreamsPublished(true);
      }).catch(() => {
        if (epoch === reconnectEpochRef.current && canAutoRecoverPublish()) {
          reconnectPublishRef.current('keepalive');
        }
      });
    }, 20_000);
    return () => clearInterval(id);
  }, [canAutoRecoverPublish, phase]);

  const start = useCallback(async (opts?: { force?: boolean }): Promise<boolean> => {
    if (!isStageWebrtcEnabled()) {
      setError('Real-Time streaming is disabled in this build.');
      return false;
    }
    if (!cbRef.current.accessToken.trim()) {
      setError('Sign in to start broadcasting.');
      return false;
    }

    // Retry from a failed / stuck Go Live: cancel recoveries, then tear down half-open state.
    if (opts?.force) {
      intentionalStopRef.current = true;
      intentionalPauseRef.current = false;
      bumpReconnectEpoch();
      let spins = 0;
      while (reconnectInFlightRef.current && spins < 40) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        spins += 1;
      }
      try {
        await teardownStageConnection();
        await endServerSession();
      } catch {
        /* best-effort reset */
      }
      startInFlightRef.current = false;
      publishingRef.current = false;
      wentLiveRef.current = false;
      reconnectAttemptsRef.current = 0;
      startPromiseRef.current = null;
      setPhase('idle');
      setError(null);
      // Keep intentionalStop until the new start run begins so stale reconnects cannot sneak in.
    }

    if (startPromiseRef.current) {
      return startPromiseRef.current;
    }
    if (publishingRef.current && phaseRef.current === 'live' && wentLiveRef.current && !opts?.force) {
      return true;
    }

    const run = (async (): Promise<boolean> => {
      const previewOk = localStreamsReadyRef.current || (await ensureLocalPreview());
      if (!previewOk) {
        const msg = permissionError ?? cameraPermissionDeniedMessage();
        intentionalStopRef.current = false;
        setError(msg);
        setPhase('idle');
        return false;
      }

      startInFlightRef.current = true;
      intentionalStopRef.current = false;
      intentionalPauseRef.current = false;
      wentLiveRef.current = false;
      publishingRef.current = false;
      reconnectAttemptsRef.current = 0;
      setPhase('starting');
      setError(null);

      const markLive = () => {
        if (wentLiveRef.current) return;
        wentLiveRef.current = true;
        publishingRef.current = true;
        reconnectAttemptsRef.current = 0;
        setPhase('live');
        void cbRef.current.onBroadcastStarted?.();
        cbRef.current.onStreamRefresh?.();
      };

      try {
        const tokenPayload = await requestHostStageToken(cbRef.current.roomId, cbRef.current.accessToken);

        attachPublishListeners({
          onFirstLive: () => {
            markLive();
            scheduleTokenRefresh(tokenPayload.expiresInSeconds);
          },
          // Reconnect only after we have actually gone live once.
          allowReconnect: true,
        });

        await withIvsStageSerialized(async () => {
          await joinStage(tokenPayload.token);
          await setStreamsPublished(true);
        });
        // Publish succeeded — mark live even if the native "published" event raced past us.
        markLive();
        scheduleTokenRefresh(tokenPayload.expiresInSeconds);
        return true;
      } catch (err) {
        intentionalStopRef.current = true;
        bumpReconnectEpoch();
        try {
          await teardownStageConnection();
          await endServerSession();
        } catch {
          /* best-effort */
        }
        wentLiveRef.current = false;
        publishingRef.current = false;
        reconnectAttemptsRef.current = 0;
        intentionalStopRef.current = false;
        setPhase('idle');
        setError(friendlyPublishError(err));
        return false;
      } finally {
        startInFlightRef.current = false;
      }
    })();

    startPromiseRef.current = run;
    try {
      return await run;
    } finally {
      if (startPromiseRef.current === run) {
        startPromiseRef.current = null;
      }
    }
  }, [
    attachPublishListeners,
    bumpReconnectEpoch,
    ensureLocalPreview,
    endServerSession,
    permissionError,
    scheduleTokenRefresh,
    teardownStageConnection,
  ]);

  /** Stop publishing to buyers; keep local preview for the seller. */
  const stop = useCallback(async () => {
    intentionalStopRef.current = true;
    intentionalPauseRef.current = false;
    bumpReconnectEpoch();
    clearTokenRefreshTimer();
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
      publishingRef.current = false;
      interruptedPublishRef.current = false;
      reconnectAttemptsRef.current = 0;
      setPhase('idle');
    }
  }, [bumpReconnectEpoch, clearTokenRefreshTimer, endServerSession, phase, teardownStageConnection]);

  /** Pause video/audio to buyers while keeping the stage session warm. */
  const pause = useCallback(async () => {
    if (phase !== 'live' && phase !== 'paused') return;
    if (phase === 'paused' && intentionalPauseRef.current && !publishingRef.current) return;
    setError(null);
    try {
      intentionalPauseRef.current = true;
      bumpReconnectEpoch();
      publishingRef.current = false;
      setPhase('paused');
      await withIvsStageSerialized(async () => {
        await setStreamsPublished(false);
      });
    } catch (err) {
      // Still treat as paused so buyers aren't stuck on a half-open publish.
      intentionalPauseRef.current = true;
      publishingRef.current = false;
      setPhase('paused');
      setError(friendlyPublishError(err));
    }
  }, [bumpReconnectEpoch, phase]);

  /**
   * Resume after Pause / leave-app. Try a warm publish toggle first; if the OS tore Stage
   * down in the background, leave + rejoin + publish (auto-reconnect cannot do this while paused).
   * Returns true only after buyers can receive video again.
   */
  const resume = useCallback(async (): Promise<boolean> => {
    if (phaseRef.current !== 'paused') return false;
    setError(null);

    const previewOk = localStreamsReadyRef.current || (await ensureLocalPreview());
    if (!previewOk) {
      const msg = permissionError ?? cameraPermissionDeniedMessage();
      setError(msg);
      return false;
    }

    // 1) Warm session — same as Pause toggle reverse.
    try {
      await withIvsStageSerialized(async () => {
        await setStreamsPublished(true);
      });
      intentionalPauseRef.current = false;
      interruptedPublishRef.current = false;
      publishingRef.current = true;
      wentLiveRef.current = true;
      if (mountedRef.current) {
        setPhase('live');
        setError(null);
      }
      cbRef.current.onStreamRefresh?.();
      return true;
    } catch {
      /* Stage likely dead after background — full rejoin below */
    }

    // 2) Full recover: leave + fresh token + join + publish (allowed from paused).
    if (reconnectInFlightRef.current || startInFlightRef.current) return false;
    reconnectInFlightRef.current = true;
    clearTokenRefreshTimer();
    if (mountedRef.current) {
      setPhase('starting');
      setError(null);
    }

    try {
      await withIvsStageSerialized(async () => {
        clearStageListeners();
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
      });

      if (intentionalStopRef.current || !mountedRef.current) {
        if (mountedRef.current) setPhase('paused');
        return false;
      }

      const tokenPayload = await refreshHostStageToken(cbRef.current.roomId, cbRef.current.accessToken);

      if (intentionalStopRef.current || !mountedRef.current) {
        if (mountedRef.current) setPhase('paused');
        return false;
      }

      attachPublishListeners({
        onFirstLive: () => {
          intentionalPauseRef.current = false;
          interruptedPublishRef.current = false;
          publishingRef.current = true;
          wentLiveRef.current = true;
          reconnectAttemptsRef.current = 0;
          if (mountedRef.current) {
            setPhase('live');
            setError(null);
          }
          scheduleTokenRefresh(tokenPayload.expiresInSeconds);
          cbRef.current.onStreamRefresh?.();
        },
        allowReconnect: true,
      });

      await withIvsStageSerialized(async () => {
        await joinStage(tokenPayload.token);
        await setStreamsPublished(true);
      });

      if (intentionalStopRef.current || !mountedRef.current) {
        if (mountedRef.current) setPhase('paused');
        return false;
      }

      intentionalPauseRef.current = false;
      interruptedPublishRef.current = false;
      publishingRef.current = true;
      wentLiveRef.current = true;
      reconnectAttemptsRef.current = 0;
      if (mountedRef.current) {
        setPhase('live');
        setError(null);
      }
      scheduleTokenRefresh(tokenPayload.expiresInSeconds);
      cbRef.current.onStreamRefresh?.();
      return true;
    } catch (err) {
      intentionalPauseRef.current = true;
      publishingRef.current = false;
      if (mountedRef.current) {
        setPhase('paused');
        setError(friendlyPublishError(err));
      }
      return false;
    } finally {
      reconnectInFlightRef.current = false;
    }
  }, [
    attachPublishListeners,
    clearStageListeners,
    clearTokenRefreshTimer,
    ensureLocalPreview,
    permissionError,
    scheduleTokenRefresh,
  ]);

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
    cameraZoom,
    zoomStops,
    setCameraZoom,
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
