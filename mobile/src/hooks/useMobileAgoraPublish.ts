import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Sentry from '@sentry/react-native';
import type * as AgoraSdk from 'react-native-agora';
import { requestPermissions } from 'expo-realtime-ivs-broadcast';
import {
  endAgoraHostSession,
  refreshAgoraHostSession,
  requestAgoraHostSession,
  startAgoraRelay,
  type AgoraHostSession,
} from '../api/agoraHostRepository';
import { getAgoraEngine, loadAgoraSdk, releaseAgoraEngine } from '../lib/agoraEngine';
import {
  AGORA_HOST_VIDEO,
  agoraTokenRefreshDelayMs,
  agoraZoomStops,
  clampAgoraZoom,
  friendlyAgoraError,
  relayRetryDelayMs,
} from '../lib/agoraHost';
import {
  LIVE_BACKGROUND_SUSPEND_DWELL_MS,
  shouldAutoResumeOnForeground,
  shouldHostBackgroundAutoPause,
} from '../lib/livePlaybackAppState';
import {
  cameraPermissionDeniedMessage,
  cameraPermissionUnavailableMessage,
  SELLER_DEFAULT_CAMERA_FACING,
  type SellerCameraFacing,
} from '../lib/sellerHostCamera';
import type { MobileHostBroadcastPhase, SellerCameraPermissionState } from './useMobileStagePublish';

const JOIN_TIMEOUT_MS = 20_000;
const MAX_REJOIN_ATTEMPTS = 8;
const REJOIN_LOOP_DELAY_MS = 5_000;
const RELAY_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Seller publisher for the backup real-time provider (Agora). Same inputs and outputs as
 * `useMobileStagePublish` so the host screen drives either one identically:
 *
 *   phone camera -> Agora channel -> (server-side Media Push) -> Cloudflare -> buyers' HLS
 *
 * The camera preview starts on mount (rear camera). Play joins the Agora channel as the broadcaster
 * and asks the server to start the relay. Pause stops publishing but stays in the channel; Resume
 * republishes and re-checks the relay. Stop leaves the channel and ends the server session.
 */
export function useMobileAgoraPublish(args: {
  roomId: string;
  accessToken: string;
  /** When true, request permissions and start the rear-camera preview. */
  previewEnabled: boolean;
  /** Agora App ID (public) from the publisher lookup. */
  agoraAppId: string | null;
  onBroadcastStarted?: () => void;
  onStreamRefresh?: () => void;
  onBackgroundAutoPause?: () => void | Promise<void>;
  onBackgroundAutoResume?: () => void | Promise<void>;
}) {
  const cbRef = useRef(args);
  cbRef.current = args;

  const [phase, setPhase] = useState<MobileHostBroadcastPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [localPreviewReady, setLocalPreviewReady] = useState(false);
  const [permissionState, setPermissionState] = useState<SellerCameraPermissionState>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<SellerCameraFacing>(SELLER_DEFAULT_CAMERA_FACING);
  const [cameraMirrorOverride, setCameraMirrorOverrideState] = useState<boolean | null>(null);
  const [cameraZoom, setCameraZoomState] = useState(1);
  const [zoomStops, setZoomStops] = useState<number[]>([1]);
  const [microphoneMuted, setMicrophoneMutedState] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const mountedRef = useRef(true);
  const phaseRef = useRef<MobileHostBroadcastPhase>('idle');
  const publishingRef = useRef(false);
  const wentLiveRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const intentionalPauseRef = useRef(false);
  const backgroundedWhilePausedRef = useRef(false);
  const joinedRef = useRef(false);
  const previewRunningRef = useRef(false);
  const previewPromiseRef = useRef<Promise<boolean> | null>(null);
  const startPromiseRef = useRef<Promise<boolean> | null>(null);
  const reconnectInFlightRef = useRef(false);
  const epochRef = useRef(0);
  const sessionRef = useRef<AgoraHostSession | null>(null);
  const mutedRef = useRef(false);
  const facingRef = useRef<SellerCameraFacing>(SELLER_DEFAULT_CAMERA_FACING);
  const maxZoomRef = useRef(1);
  const tokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinWaiterRef = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const handlerRef = useRef<AgoraSdk.IRtcEngineEventHandler | null>(null);
  const handlerEngineRef = useRef<AgoraSdk.IRtcEngine | null>(null);
  const sawReconnectingRef = useRef(false);
  const rejoinRef = useRef<(trigger: string) => void>(() => {});
  const refreshTokenRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setPublishingActive = useCallback((next: boolean) => {
    publishingRef.current = next;
    if (mountedRef.current) setPublishing(next);
  }, []);

  const clearTokenTimer = useCallback(() => {
    if (tokenTimerRef.current != null) {
      clearTimeout(tokenTimerRef.current);
      tokenTimerRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback(
    (expiresInSeconds: number) => {
      clearTokenTimer();
      tokenTimerRef.current = setTimeout(() => {
        void refreshTokenRef.current();
      }, agoraTokenRefreshDelayMs(expiresInSeconds));
    },
    [clearTokenTimer],
  );

  /** Fresh server token -> Agora renewToken. Best effort; a failed renewal falls back to rejoin on expiry. */
  const refreshToken = useCallback(async () => {
    const { roomId, accessToken, agoraAppId } = cbRef.current;
    if (!joinedRef.current || !agoraAppId || !accessToken.trim()) return;
    try {
      const session = await refreshAgoraHostSession(roomId, accessToken);
      sessionRef.current = session;
      getAgoraEngine(agoraAppId).renewToken(session.token);
      scheduleTokenRefresh(session.expiresInSeconds);
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'agora_host',
        message: `token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        level: 'warning',
      });
    }
  }, [scheduleTokenRefresh]);
  refreshTokenRef.current = refreshToken;

  const attachHandler = useCallback((engine: AgoraSdk.IRtcEngine) => {
    const lib = loadAgoraSdk();
    if (!lib || handlerEngineRef.current === engine) return;
    if (handlerRef.current && handlerEngineRef.current) {
      try {
        handlerEngineRef.current.unregisterEventHandler(handlerRef.current);
      } catch {
        /* ignore */
      }
    }
    const handler: AgoraSdk.IRtcEngineEventHandler = {
      onJoinChannelSuccess: () => {
        joinedRef.current = true;
        joinWaiterRef.current?.resolve();
        joinWaiterRef.current = null;
      },
      onLeaveChannel: () => {
        joinedRef.current = false;
      },
      onError: (code, msg) => {
        // Join failures surface here when the token or App ID is rejected.
        if (joinWaiterRef.current) {
          joinWaiterRef.current.reject(new Error(msg || `Live video error ${code}`));
          joinWaiterRef.current = null;
        }
      },
      onTokenPrivilegeWillExpire: () => {
        void refreshTokenRef.current();
      },
      onRequestToken: () => {
        void refreshTokenRef.current();
      },
      onConnectionStateChanged: (_connection, state) => {
        const S = lib.ConnectionStateType;
        if (state === S.ConnectionStateReconnecting) {
          sawReconnectingRef.current = true;
          return;
        }
        if (state === S.ConnectionStateConnected && sawReconnectingRef.current) {
          sawReconnectingRef.current = false;
          // Back after a drop: make sure the relay (which idles out after a few minutes) is still up.
          if (phaseRef.current === 'live' && !intentionalPauseRef.current) rejoinRef.current('reconnected');
          return;
        }
        if (state === S.ConnectionStateFailed) {
          joinedRef.current = false;
          if (phaseRef.current === 'live' && !intentionalPauseRef.current) rejoinRef.current('connection_failed');
        }
      },
    };
    engine.registerEventHandler(handler);
    handlerRef.current = handler;
    handlerEngineRef.current = engine;
  }, []);

  /** Camera on, rear by default, portrait encoder. Safe to call repeatedly. */
  const configureAndPreview = useCallback(
    (engine: AgoraSdk.IRtcEngine, opts: { resetFacing: boolean }) => {
      const lib = loadAgoraSdk();
      if (!lib) throw new Error('Live video backup is not available in this version of the app.');
      attachHandler(engine);
      engine.enableVideo();
      engine.enableAudio();
      engine.setVideoEncoderConfiguration({
        dimensions: { width: AGORA_HOST_VIDEO.width, height: AGORA_HOST_VIDEO.height },
        frameRate: AGORA_HOST_VIDEO.frameRate,
        bitrate: AGORA_HOST_VIDEO.bitrateKbps,
        orientationMode: lib.OrientationMode.OrientationModeFixedPortrait,
        mirrorMode: lib.VideoMirrorModeType.VideoMirrorModeDisabled,
        codecType: lib.VideoCodecType.VideoCodecH264,
      });
      if (opts.resetFacing) {
        engine.setCameraCapturerConfiguration({ cameraDirection: lib.CameraDirection.CameraRear });
        facingRef.current = SELLER_DEFAULT_CAMERA_FACING;
        setCameraFacing(SELLER_DEFAULT_CAMERA_FACING);
      }
      const code = engine.startPreview();
      if (typeof code === 'number' && code < 0) throw new Error(`Could not start the camera (code ${code}).`);
      previewRunningRef.current = true;
    },
    [attachHandler],
  );

  const refreshZoomStops = useCallback((engine: AgoraSdk.IRtcEngine) => {
    try {
      const supported = facingRef.current === 'back' && engine.isCameraZoomSupported();
      const max = supported ? engine.getCameraMaxZoomFactor() : 1;
      maxZoomRef.current = max;
      if (mountedRef.current) setZoomStops(agoraZoomStops(max, supported));
    } catch {
      maxZoomRef.current = 1;
      if (mountedRef.current) setZoomStops([1]);
    }
  }, []);

  const ensureLocalPreview = useCallback(async (): Promise<boolean> => {
    if (previewRunningRef.current) return true;
    if (previewPromiseRef.current) return previewPromiseRef.current;
    const run = (async () => {
      const appId = cbRef.current.agoraAppId;
      if (!appId) {
        setPermissionState('unavailable');
        setPermissionError(cameraPermissionUnavailableMessage());
        return false;
      }
      setPermissionState('requesting');
      setPermissionError(null);
      try {
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
        const engine = getAgoraEngine(appId);
        configureAndPreview(engine, { resetFacing: true });
        refreshZoomStops(engine);
        if (mountedRef.current) {
          setLocalPreviewReady(true);
          setPermissionState('granted');
        }
        return true;
      } catch (err) {
        const msg = friendlyAgoraError(err);
        if (mountedRef.current) {
          setLocalPreviewReady(false);
          if (/permission|denied/i.test(msg)) {
            setPermissionState('denied');
            setPermissionError(cameraPermissionDeniedMessage());
          } else {
            setPermissionState('unavailable');
            setPermissionError(msg);
          }
        }
        return false;
      }
    })().finally(() => {
      previewPromiseRef.current = null;
    });
    previewPromiseRef.current = run;
    return run;
  }, [configureAndPreview, refreshZoomStops]);

  useEffect(() => {
    if (!args.previewEnabled || !args.agoraAppId) return;
    const frame = requestAnimationFrame(() => {
      void ensureLocalPreview();
    });
    return () => cancelAnimationFrame(frame);
  }, [args.previewEnabled, args.agoraAppId, ensureLocalPreview]);

  /** Join the channel with a session and wait until Agora confirms. */
  const joinWithSession = useCallback(
    async (session: AgoraHostSession) => {
      const lib = loadAgoraSdk();
      if (!lib) throw new Error('Live video backup is not available in this version of the app.');
      const engine = getAgoraEngine(session.appId);
      attachHandler(engine);
      sessionRef.current = session;
      const joined = new Promise<void>((resolve, reject) => {
        joinWaiterRef.current = { resolve, reject };
        setTimeout(() => {
          if (joinWaiterRef.current?.resolve === resolve) {
            joinWaiterRef.current = null;
            reject(new Error('Could not reach the live video service. Check your connection and try again.'));
          }
        }, JOIN_TIMEOUT_MS);
      });
      const code = engine.joinChannel(session.token, session.channel, session.uid, {
        channelProfile: lib.ChannelProfileType.ChannelProfileLiveBroadcasting,
        clientRoleType: lib.ClientRoleType.ClientRoleBroadcaster,
        publishCameraTrack: true,
        publishMicrophoneTrack: !mutedRef.current,
        autoSubscribeAudio: false,
        autoSubscribeVideo: false,
      });
      if (typeof code === 'number' && code < 0) {
        joinWaiterRef.current = null;
        throw new Error(`Could not join live video (code ${code}).`);
      }
      await joined;
      scheduleTokenRefresh(session.expiresInSeconds);
    },
    [attachHandler, scheduleTokenRefresh],
  );

  /** Ask the server to start the relay; retried briefly because the first call can race the join. */
  const ensureRelay = useCallback(async () => {
    const { roomId, accessToken } = cbRef.current;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= RELAY_ATTEMPTS; attempt += 1) {
      try {
        await startAgoraRelay(roomId, accessToken);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < RELAY_ATTEMPTS) await sleep(relayRetryDelayMs(attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Could not start live video for buyers.');
  }, []);

  const leaveChannelQuietly = useCallback(() => {
    const appId = cbRef.current.agoraAppId;
    if (!appId) return;
    try {
      getAgoraEngine(appId).leaveChannel();
    } catch {
      /* ignore */
    }
    joinedRef.current = false;
  }, []);

  const start = useCallback(
    async (_opts?: { force?: boolean }): Promise<boolean> => {
      if (startPromiseRef.current) return startPromiseRef.current;
      const run = (async () => {
        const { roomId, accessToken } = cbRef.current;
        if (!accessToken.trim()) {
          setError('Sign in to go live.');
          return false;
        }
        intentionalStopRef.current = false;
        intentionalPauseRef.current = false;
        epochRef.current += 1;
        setError(null);
        setPhase('starting');
        try {
          const previewOk = await ensureLocalPreview();
          if (!previewOk) throw new Error(cbRef.current.agoraAppId ? cameraPermissionDeniedMessage() : cameraPermissionUnavailableMessage());
          const session = await requestAgoraHostSession(roomId, accessToken);
          if (session.appId !== cbRef.current.agoraAppId) {
            // App ID changed under us (rotated in the console): rebuild the engine with the new one.
            releaseAgoraEngine();
            previewRunningRef.current = false;
            handlerEngineRef.current = null;
            const engine = getAgoraEngine(session.appId);
            configureAndPreview(engine, { resetFacing: false });
          }
          await joinWithSession(session);
          await ensureRelay();
          wentLiveRef.current = true;
          setPublishingActive(true);
          if (mountedRef.current) setPhase('live');
          cbRef.current.onBroadcastStarted?.();
          cbRef.current.onStreamRefresh?.();
          return true;
        } catch (err) {
          leaveChannelQuietly();
          clearTokenTimer();
          void endAgoraHostSession(roomId, accessToken).catch(() => undefined);
          setPublishingActive(false);
          wentLiveRef.current = false;
          if (mountedRef.current) {
            setPhase('idle');
            setError(friendlyAgoraError(err));
          }
          return false;
        }
      })().finally(() => {
        startPromiseRef.current = null;
      });
      startPromiseRef.current = run;
      return run;
    },
    [clearTokenTimer, configureAndPreview, ensureLocalPreview, ensureRelay, joinWithSession, leaveChannelQuietly, setPublishingActive],
  );

  const stop = useCallback(async (): Promise<void> => {
    const { roomId, accessToken } = cbRef.current;
    intentionalStopRef.current = true;
    epochRef.current += 1;
    if (mountedRef.current) setPhase('stopping');
    clearTokenTimer();
    leaveChannelQuietly();
    setPublishingActive(false);
    wentLiveRef.current = false;
    intentionalPauseRef.current = false;
    backgroundedWhilePausedRef.current = false;
    try {
      await endAgoraHostSession(roomId, accessToken);
    } catch {
      /* the room's own end-of-show path also tears the relay down */
    }
    if (mountedRef.current) {
      setPhase('idle');
      setError(null);
    }
  }, [clearTokenTimer, leaveChannelQuietly, setPublishingActive]);

  /** Pause button and leaving the app: stop publishing, stay in the channel. */
  const minimizeShow = useCallback(
    async (opts?: { causedByBackground?: boolean }) => {
      if (intentionalStopRef.current) return;
      const p = phaseRef.current;
      if (p !== 'live' && p !== 'paused' && p !== 'starting') return;
      const alreadyMinimized = intentionalPauseRef.current && p === 'paused' && !publishingRef.current;

      backgroundedWhilePausedRef.current = Boolean(opts?.causedByBackground);
      intentionalPauseRef.current = true;
      epochRef.current += 1;
      setPublishingActive(false);
      if (mountedRef.current) {
        setPhase('paused');
        setError(null);
      }
      try {
        await cbRef.current.onBackgroundAutoPause?.();
      } catch {
        /* retried on foreground */
      }
      if (alreadyMinimized) return;
      try {
        const appId = cbRef.current.agoraAppId;
        if (appId && joinedRef.current) {
          getAgoraEngine(appId).updateChannelMediaOptions({
            publishCameraTrack: false,
            publishMicrophoneTrack: false,
          });
        }
      } catch {
        /* stay paused — the native call can throw after the OS suspends the app */
      }
    },
    [setPublishingActive],
  );

  const minimizeShowRef = useRef(minimizeShow);
  minimizeShowRef.current = minimizeShow;

  /** Play after Pause (or after a drop): republish, re-check the relay. */
  const resumeShow = useCallback(async (): Promise<boolean> => {
    const { roomId, accessToken, agoraAppId } = cbRef.current;
    if (!agoraAppId || !accessToken.trim()) return false;
    if (phaseRef.current === 'live' && publishingRef.current) return true;
    intentionalStopRef.current = false;
    setError(null);
    try {
      const engine = getAgoraEngine(agoraAppId);
      configureAndPreview(engine, { resetFacing: false });
      if (!joinedRef.current) {
        const session = await refreshAgoraHostSession(roomId, accessToken);
        await joinWithSession(session);
      } else {
        await refreshTokenRef.current();
        engine.updateChannelMediaOptions({
          publishCameraTrack: true,
          publishMicrophoneTrack: !mutedRef.current,
        });
      }
      await ensureRelay();
      intentionalPauseRef.current = false;
      backgroundedWhilePausedRef.current = false;
      wentLiveRef.current = true;
      setPublishingActive(true);
      if (mountedRef.current) setPhase('live');
      cbRef.current.onStreamRefresh?.();
      return true;
    } catch (err) {
      intentionalPauseRef.current = true;
      setPublishingActive(false);
      if (mountedRef.current) {
        setPhase('paused');
        setError(friendlyAgoraError(err));
      }
      return false;
    }
  }, [configureAndPreview, ensureRelay, joinWithSession, setPublishingActive]);

  /** Network drop / failed connection while live: rejoin with a fresh token, then re-check the relay. */
  const rejoin = useCallback(
    async (trigger: string) => {
      if (reconnectInFlightRef.current) return;
      if (!wentLiveRef.current || intentionalStopRef.current || intentionalPauseRef.current) return;
      reconnectInFlightRef.current = true;
      const epoch = epochRef.current;
      try {
        for (let attempt = 1; attempt <= MAX_REJOIN_ATTEMPTS; attempt += 1) {
          if (epoch !== epochRef.current || !mountedRef.current) return;
          try {
            if (!joinedRef.current) {
              const { roomId, accessToken } = cbRef.current;
              const session = await refreshAgoraHostSession(roomId, accessToken);
              await joinWithSession(session);
            }
            await ensureRelay();
            cbRef.current.onStreamRefresh?.();
            return;
          } catch (err) {
            Sentry.addBreadcrumb({
              category: 'agora_host',
              message: `rejoin (${trigger}) attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`,
              level: 'warning',
            });
            await sleep(REJOIN_LOOP_DELAY_MS);
          }
        }
        if (epoch === epochRef.current && mountedRef.current) {
          setError('Lost connection to live video. Tap Resume to reconnect.');
          intentionalPauseRef.current = true;
          setPublishingActive(false);
          setPhase('paused');
        }
      } finally {
        reconnectInFlightRef.current = false;
      }
    },
    [ensureRelay, joinWithSession, setPublishingActive],
  );
  rejoinRef.current = (trigger) => void rejoin(trigger);

  // Leaving the app while live pauses (debounced); coming back auto-resumes when it was a real background.
  useEffect(() => {
    let minimizeTimer: ReturnType<typeof setTimeout> | null = null;
    const clearMinimizeTimer = () => {
      if (minimizeTimer != null) {
        clearTimeout(minimizeTimer);
        minimizeTimer = null;
      }
    };
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (
        shouldHostBackgroundAutoPause({
          appState: next,
          wentLive: wentLiveRef.current,
          intentionalStop: intentionalStopRef.current,
          phase: phaseRef.current,
        })
      ) {
        clearMinimizeTimer();
        minimizeTimer = setTimeout(() => {
          minimizeTimer = null;
          if (AppState.currentState !== 'background') return;
          void minimizeShowRef.current({ causedByBackground: true });
        }, LIVE_BACKGROUND_SUSPEND_DWELL_MS);
        return;
      }
      if (next !== 'active') return;
      clearMinimizeTimer();
      if (intentionalPauseRef.current || (phaseRef.current === 'paused' && !publishingRef.current)) {
        if (
          shouldAutoResumeOnForeground({
            intentionalPause: intentionalPauseRef.current,
            causedByBackground: backgroundedWhilePausedRef.current,
          })
        ) {
          void cbRef.current.onBackgroundAutoResume?.();
          return;
        }
        if (intentionalPauseRef.current) {
          if (mountedRef.current) {
            setPhase('paused');
            setError(null);
          }
          void Promise.resolve(cbRef.current.onBackgroundAutoPause?.()).catch(() => undefined);
        }
      }
    });
    return () => {
      clearMinimizeTimer();
      sub.remove();
    };
  }, []);

  const flipCamera = useCallback(async () => {
    const appId = cbRef.current.agoraAppId;
    if (!appId || !previewRunningRef.current) return;
    try {
      const engine = getAgoraEngine(appId);
      engine.switchCamera();
      const next: SellerCameraFacing = facingRef.current === 'back' ? 'front' : 'back';
      facingRef.current = next;
      setCameraFacing(next);
      setCameraZoomState(1);
      refreshZoomStops(engine);
    } catch (err) {
      setError(friendlyAgoraError(err));
    }
  }, [refreshZoomStops]);

  const setCameraZoom = useCallback(async (factor: number) => {
    const appId = cbRef.current.agoraAppId;
    if (!appId || !previewRunningRef.current) return;
    const next = clampAgoraZoom(factor, maxZoomRef.current);
    try {
      getAgoraEngine(appId).setCameraZoomFactor(next);
      setCameraZoomState(next);
    } catch {
      /* zoom is best effort */
    }
  }, []);

  const toggleMirrorFix = useCallback(async () => {
    // The broadcast is never mirrored; this only controls whether the host's own preview is.
    setCameraMirrorOverrideState((prev) => (prev === false ? null : false));
  }, []);

  const toggleMicrophoneMute = useCallback(async () => {
    const appId = cbRef.current.agoraAppId;
    if (!appId || !previewRunningRef.current) return;
    const next = !mutedRef.current;
    try {
      getAgoraEngine(appId).muteLocalAudioStream(next);
      mutedRef.current = next;
      setMicrophoneMutedState(next);
    } catch (err) {
      setError(friendlyAgoraError(err));
    }
  }, []);

  const retryPreviewPermission = useCallback(async () => {
    if (previewPromiseRef.current) await previewPromiseRef.current.catch(() => false);
    previewRunningRef.current = false;
    setLocalPreviewReady(false);
    setPermissionState('requesting');
    setPermissionError(null);
    await ensureLocalPreview();
  }, [ensureLocalPreview]);

  const releaseLocalDevices = useCallback(() => {
    clearTokenTimer();
    const engine = handlerEngineRef.current;
    if (engine) {
      try {
        if (handlerRef.current) engine.unregisterEventHandler(handlerRef.current);
        engine.stopPreview();
      } catch {
        /* ignore */
      }
    }
    handlerRef.current = null;
    handlerEngineRef.current = null;
    previewRunningRef.current = false;
    releaseAgoraEngine();
    joinedRef.current = false;
    mutedRef.current = false;
    facingRef.current = SELLER_DEFAULT_CAMERA_FACING;
    if (mountedRef.current) {
      setLocalPreviewReady(false);
      setCameraFacing(SELLER_DEFAULT_CAMERA_FACING);
      setCameraMirrorOverrideState(null);
      setCameraZoomState(1);
      setZoomStops([1]);
      setMicrophoneMutedState(false);
      setPermissionState('idle');
    }
  }, [clearTokenTimer]);

  const releaseCamera = useCallback(async () => {
    if (publishingRef.current || phaseRef.current === 'live' || phaseRef.current === 'paused' || phaseRef.current === 'starting') {
      await stop();
    }
    releaseLocalDevices();
  }, [releaseLocalDevices, stop]);

  useEffect(() => {
    return () => {
      leaveChannelQuietly();
      releaseLocalDevices();
    };
    // Unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = minimizeShow;
  const resume = resumeShow;

  return {
    phase,
    error,
    localPreviewReady,
    permissionState,
    permissionError,
    cameraFacing,
    cameraMirrorOverride,
    toggleMirrorFix,
    cameraZoom,
    zoomStops,
    setCameraZoom,
    start,
    stop,
    minimizeShow,
    resumeShow,
    pause,
    resume,
    releaseCamera,
    flipCamera,
    toggleMicrophoneMute,
    microphoneMuted,
    retryPreviewPermission,
    isPublishing: publishing,
  };
}
