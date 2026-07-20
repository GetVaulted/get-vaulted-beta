import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  getBuyerLiveStreamCached,
  invalidateBuyerLiveStreamCache,
  invalidateViewerStageToken,
  peekBuyerLiveStreamCacheAgeMs,
  peekCachedBuyerLiveStream,
  peekPrefetchedViewerStageToken,
} from '../lib/liveStreamPrefetchCache';
import {
  HLS_FIRST_FRAME_TIMEOUT_MS,
  MAX_PLAYER_RETRIES,
  PLAYBACK_RECONNECT_FAILED_MS,
  PLAYBACK_RECONNECT_SLOW_MS,
  PLAYER_BACKOFF_BASE_MS,
  STREAM_POLL_MS,
  WEBRTC_UPGRADE_DWELL_MS,
  isBuyerStageWebrtcRejoinBlocked,
  isHybridLiveEnabled,
  isLiveStreamSignal,
  resolveSurfaceTransportPlan,
  shouldAttachHlsPlayback,
  shouldUseStageWebrtcPlayback,
  type BuyerSafeStreamFields,
  type LivePlaybackTransport,
  type ViewerTransportState,
} from '../lib/liveStreamPlayback';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';

export type LivePlaybackMode = 'active' | 'prefetch' | 'off';

const PREFETCH_POLL_MS = 10_000;
const LIVE_PLAYBACK_HEALTH_MS = 15_000;
const NO_VIDEO_RECOVER_MS = 12_000;
/** Avoid flashing reconnect UI on brief Stage hiccups. */
const RECONNECT_UI_DELAY_MS = 1_800;

function applyStreamToTransport(args: {
  safe: BuyerSafeStreamFields;
  accessToken?: string;
  webrtcFailed: boolean;
  playbackMode: LivePlaybackMode;
  hybridEnabled: boolean;
  alreadyUpgraded: boolean;
  hlsStalled: boolean;
  lastAttachKeyRef: React.MutableRefObject<string>;
  applyTransport: (next: LivePlaybackTransport) => void;
  setPlayerFatal: (v: boolean) => void;
  setVideoHasData: (v: boolean) => void;
  armWebrtcUpgrade: () => void;
  cancelWebrtcUpgrade: () => void;
}) {
  const plan = resolveSurfaceTransportPlan({
    stream: args.safe,
    isActive: args.playbackMode === 'active',
    webrtcFailed: args.webrtcFailed,
    accessToken: args.accessToken,
    hybridEnabled: args.hybridEnabled,
    alreadyUpgraded: args.alreadyUpgraded,
    hlsStalled: args.hlsStalled,
  });

  if (plan.armUpgrade) {
    args.armWebrtcUpgrade();
  } else {
    args.cancelWebrtcUpgrade();
  }

  if (plan.transport === 'webrtc') {
    args.applyTransport('webrtc');
    args.lastAttachKeyRef.current = '';
    args.setPlayerFatal(false);
    return;
  }

  if (plan.transport === 'hls') {
    const attachKey = `${args.safe.playbackUrl ?? ''}|${args.safe.streamHealth}`;
    args.applyTransport('hls');
    if (args.lastAttachKeyRef.current !== attachKey) {
      args.lastAttachKeyRef.current = attachKey;
      args.setVideoHasData(false);
      args.setPlayerFatal(false);
    }
    return;
  }

  args.applyTransport(plan.transport);
  args.lastAttachKeyRef.current = '';
  args.setVideoHasData(false);
}

export function useLiveStagePlayback(args: {
  roomId: string;
  /** `prefetch` keeps the next/prev show warm while off-screen; `off` tears down. */
  playbackMode: LivePlaybackMode;
  accessToken?: string;
  refreshNonce?: number;
  /** Bumps on each new focus visit — logged in the structured playback plan. */
  roomVisitNonce?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);
  const [stream, setStream] = useState<BuyerSafeStreamFields | null>(() =>
    peekCachedBuyerLiveStream(args.roomId),
  );
  const [transport, setTransport] = useState<LivePlaybackTransport>('none');
  const [videoHasData, setVideoHasData] = useState(false);
  const [playerFatal, setPlayerFatal] = useState(false);
  const [playerRetryCount, setPlayerRetryCount] = useState(0);

  const retryRef = useRef(0);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttachKeyRef = useRef('');
  const transportRef = useRef<LivePlaybackTransport>('none');
  const webrtcFailedRef = useRef(false);
  const webrtcFailoverCountRef = useRef(0);
  const noVideoSinceRef = useRef<number | null>(null);
  const playbackModeRef = useRef(args.playbackMode);
  const [webrtcSubscribeEpoch, setWebrtcSubscribeEpoch] = useState(0);
  const reconnectUiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hybridEnabled = isHybridLiveEnabled();

  // Re-entry playback attempt tracking. Every reconnect (focus, refresh, app-resume, retry) begins a
  // new attempt; async results must verify they still belong to the current attempt before mutating
  // state, and the first-frame watchdog is keyed to the attempt so a per-2.5s stream poll can't keep
  // resetting it.
  const playbackAttemptIdRef = useRef(0);
  const [attemptNonce, setAttemptNonce] = useState(0);
  // True once the current attempt tried HLS and it never reached first frame — forces the WebRTC
  // fallback surface. Presence of a `playbackUrl` is never treated as proof HLS is playable.
  const hlsStalledRef = useRef(false);
  // Mirrors for watchdog timers that fire outside the render cycle.
  const videoHasDataRef = useRef(false);
  const streamRef = useRef<BuyerSafeStreamFields | null>(stream);
  useEffect(() => {
    videoHasDataRef.current = videoHasData;
  }, [videoHasData]);
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);
  // Dwell-upgrade: the active show previews HLS instantly, then flips to sub-second WebRTC after a
  // short dwell. `webrtcUpgradedRef` latches so the 2.5s stream poll doesn't drop back to HLS once
  // upgraded; it resets whenever the page stops being active (swipe away / off / unmount).
  const webrtcUpgradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webrtcUpgradedRef = useRef(false);

  const clearReconnectUiTimer = useCallback(() => {
    if (reconnectUiTimerRef.current != null) {
      clearTimeout(reconnectUiTimerRef.current);
      reconnectUiTimerRef.current = null;
    }
  }, []);

  const showReconnectingUi = useCallback(() => {
    clearReconnectUiTimer();
    reconnectUiTimerRef.current = setTimeout(() => {
      reconnectUiTimerRef.current = null;
      setReconnecting(true);
    }, RECONNECT_UI_DELAY_MS);
  }, [clearReconnectUiTimer]);

  const hideReconnectingUi = useCallback(() => {
    clearReconnectUiTimer();
    setReconnecting(false);
  }, [clearReconnectUiTimer]);

  const clearBackoff = useCallback(() => {
    if (backoffTimerRef.current != null) {
      clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
  }, []);

  const applyTransport = useCallback((next: LivePlaybackTransport) => {
    if (transportRef.current === next) return;
    transportRef.current = next;
    setTransport(next);
    if (next !== 'webrtc' && next !== 'hls') {
      setVideoHasData(false);
    }
  }, []);

  const cancelWebrtcUpgrade = useCallback(() => {
    if (webrtcUpgradeTimerRef.current != null) {
      clearTimeout(webrtcUpgradeTimerRef.current);
      webrtcUpgradeTimerRef.current = null;
    }
  }, []);

  const armWebrtcUpgrade = useCallback(() => {
    if (webrtcUpgradedRef.current || webrtcUpgradeTimerRef.current != null) return;
    webrtcUpgradeTimerRef.current = setTimeout(() => {
      webrtcUpgradeTimerRef.current = null;
      // Only upgrade the still-settled foreground show. If the user swiped away (mode !== active)
      // the mode effect already reset the latch and this is a no-op.
      if (playbackModeRef.current !== 'active') return;
      webrtcUpgradedRef.current = true;
      lastAttachKeyRef.current = '';
      setPlayerFatal(false);
      applyTransport('webrtc');
      setWebrtcSubscribeEpoch((n) => n + 1);
    }, WEBRTC_UPGRADE_DWELL_MS);
  }, [applyTransport]);

  const beginPlaybackAttempt = useCallback(
    (reason: string) => {
      playbackAttemptIdRef.current += 1;
      const id = playbackAttemptIdRef.current;
      hlsStalledRef.current = false;
      setReconnectFailed(false);
      setAttemptNonce((n) => n + 1);
      viewerLifecycleLog('playback_attempt_begin', {
        roomId: args.roomId,
        attemptId: id,
        reason,
        roomVisitNonce: args.roomVisitNonce ?? null,
        refreshNonce: args.refreshNonce ?? null,
      });
      return id;
    },
    [args.roomId, args.roomVisitNonce, args.refreshNonce],
  );

  const fetchStream = useCallback(async () => {
    if (args.playbackMode === 'off' || !args.roomId) return;

    const cacheAgeBeforeFetch = peekBuyerLiveStreamCacheAgeMs(args.roomId);
    const playbackUrlSource =
      cacheAgeBeforeFetch != null && cacheAgeBeforeFetch < STREAM_POLL_MS ? 'cache' : 'network';

    try {
      const safe = await getBuyerLiveStreamCached(args.roomId, args.accessToken);
      if (!safe) {
        setFetchFailed(true);
        setLoading(false);
        applyTransport('none');
        return;
      }
      setFetchFailed(false);
      setStream(safe);
      setLoading(false);
      retryRef.current = 0;
      setPlayerRetryCount(0);
      viewerLifecycleLog('playback_url_received', {
        roomId: args.roomId,
        playbackUrl: safe.playbackUrl,
        streamHealth: safe.streamHealth,
        streamMode: safe.streamMode,
        stageAvailable: safe.stageAvailable,
      });

      if (!isLiveStreamSignal(safe.streamHealth)) {
        webrtcFailedRef.current = false;
        webrtcFailoverCountRef.current = 0;
      }

      const isActive = args.playbackMode === 'active';
      const hlsStalled = hlsStalledRef.current;
      const plan = resolveSurfaceTransportPlan({
        stream: safe,
        isActive,
        webrtcFailed: webrtcFailedRef.current,
        accessToken: args.accessToken,
        hybridEnabled,
        alreadyUpgraded: webrtcUpgradedRef.current,
        hlsStalled,
      });

      // Full playback plan for the second (and every) room visit — see required investigation.
      const rejoinBlocked = isBuyerStageWebrtcRejoinBlocked();
      const webrtcEligible = shouldUseStageWebrtcPlayback(
        safe,
        webrtcFailedRef.current,
        args.accessToken,
      );
      const hlsAttachable = shouldAttachHlsPlayback(safe.streamHealth, safe.playbackUrl);
      const selectionReason = hlsStalled
        ? 'hls_stalled_force_webrtc'
        : !webrtcEligible && hlsAttachable
          ? 'not_webrtc_eligible_use_hls'
          : rejoinBlocked && webrtcEligible && hlsAttachable
            ? 'post_leave_prefer_hls'
            : webrtcEligible && !hlsAttachable
              ? 'no_hls_url_go_webrtc'
              : webrtcEligible && hybridEnabled && plan.armUpgrade
                ? 'hls_preview_arm_webrtc_upgrade'
                : plan.transport === 'webrtc'
                  ? 'webrtc'
                  : `transport_${plan.transport}`;
      viewerLifecycleLog('viewer_playback_plan', {
        showId: args.roomId,
        roomVisitNonce: args.roomVisitNonce ?? null,
        refreshNonce: args.refreshNonce ?? null,
        screenFocused: isActive,
        playbackMode: args.playbackMode,
        showLive: isLiveStreamSignal(safe.streamHealth),
        streamHealth: safe.streamHealth,
        playbackUrlPresent: Boolean(safe.playbackUrl),
        playbackUrl: safe.playbackUrl,
        playbackUrlSource,
        playbackUrlCacheAgeMs: cacheAgeBeforeFetch,
        stageTokenPresent: peekPrefetchedViewerStageToken(args.roomId) != null,
        stageAvailable: safe.stageAvailable,
        previousStageLeave: rejoinBlocked,
        hlsStalled,
        webrtcEligible,
        hlsAttachable,
        selectedTransport: plan.transport,
        armUpgrade: plan.armUpgrade,
        selectionReason,
        playbackAttemptId: playbackAttemptIdRef.current,
      });

      applyStreamToTransport({
        safe,
        accessToken: args.accessToken,
        webrtcFailed: webrtcFailedRef.current,
        playbackMode: args.playbackMode,
        hybridEnabled,
        alreadyUpgraded: webrtcUpgradedRef.current,
        hlsStalled,
        lastAttachKeyRef,
        applyTransport,
        setPlayerFatal,
        setVideoHasData,
        armWebrtcUpgrade,
        cancelWebrtcUpgrade,
      });
      viewerLifecycleLog('source_loaded', {
        roomId: args.roomId,
        transport: plan.transport,
      });
    } catch {
      setFetchFailed(true);
      setLoading(false);
      applyTransport('none');
    }
  }, [
    applyTransport,
    args.accessToken,
    args.playbackMode,
    args.refreshNonce,
    args.roomId,
    args.roomVisitNonce,
    armWebrtcUpgrade,
    cancelWebrtcUpgrade,
    hybridEnabled,
  ]);

  // Abandon a stalled HLS attempt and force a fresh WebRTC subscriber surface. Called by the
  // first-frame watchdog. No-op if the attempt already advanced or if this room can't do WebRTC.
  const forceWebrtcFallback = useCallback(
    (attemptId: number) => {
      if (playbackAttemptIdRef.current !== attemptId) return;
      if (videoHasDataRef.current) return;
      const safe = streamRef.current;
      if (!safe || !shouldUseStageWebrtcPlayback(safe, false, args.accessToken)) {
        viewerLifecycleLog('playback_fallback_unavailable', {
          roomId: args.roomId,
          attemptId,
          reason: safe ? 'not_webrtc_eligible' : 'no_stream',
        });
        return;
      }
      hlsStalledRef.current = true;
      lastAttachKeyRef.current = '';
      setPlayerFatal(false);
      setVideoHasData(false);
      applyTransport('webrtc');
      // Fresh native surface for the fallback join (StageSubscriberVideo keys on the epoch).
      setWebrtcSubscribeEpoch((n) => n + 1);
      showReconnectingUi();
      viewerLifecycleLog('playback_fallback_forced', {
        roomId: args.roomId,
        attemptId,
        from: 'hls',
        to: 'webrtc',
      });
    },
    [applyTransport, args.accessToken, args.roomId, showReconnectingUi],
  );

  const retry = useCallback(() => {
    const id = beginPlaybackAttempt('manual_retry');
    invalidateBuyerLiveStreamCache(args.roomId);
    invalidateViewerStageToken(args.roomId);
    clearBackoff();
    retryRef.current = 0;
    setPlayerRetryCount(0);
    webrtcFailedRef.current = false;
    webrtcFailoverCountRef.current = 0;
    webrtcUpgradedRef.current = false;
    lastAttachKeyRef.current = '';
    noVideoSinceRef.current = null;
    setPlayerFatal(false);
    setVideoHasData(false);
    // Destroy HLS + leave Stage by dropping to 'none', bump the epoch so the native subscriber
    // surface remounts fresh, then refetch and re-plan (HLS first, WebRTC fallback).
    transportRef.current = 'none';
    applyTransport('none');
    setWebrtcSubscribeEpoch((n) => n + 1);
    hideReconnectingUi();
    viewerLifecycleLog('playback_retry_requested', { roomId: args.roomId, attemptId: id });
    void fetchStream();
  }, [applyTransport, args.roomId, beginPlaybackAttempt, clearBackoff, fetchStream, hideReconnectingUi]);

  useEffect(() => {
    const prevMode = playbackModeRef.current;
    playbackModeRef.current = args.playbackMode;

    // Leaving active (swipe / screen blur): drop upgrade latch + cancel dwell so the next settle
    // starts from a clean transport plan.
    if (args.playbackMode !== 'active') {
      webrtcUpgradedRef.current = false;
      cancelWebrtcUpgrade();
    }

    if (args.playbackMode === 'off') {
      if (prevMode !== 'off') {
        viewerLifecycleLog('screen_blurred', { roomId: args.roomId, from: prevMode });
        applyTransport('none');
        webrtcFailedRef.current = false;
        webrtcFailoverCountRef.current = 0;
        lastAttachKeyRef.current = '';
        noVideoSinceRef.current = null;
        setVideoHasData(false);
        setPlayerFatal(false);
        setWebrtcSubscribeEpoch(0);
        invalidateBuyerLiveStreamCache(args.roomId);
        invalidateViewerStageToken(args.roomId);
        viewerLifecycleLog('cleanup_completed', { roomId: args.roomId, layer: 'playback_hook' });
      }
      return undefined;
    }

    // Focus / re-entry: never trust stale cache or latches from the previous visit.
    if (prevMode === 'off') {
      viewerLifecycleLog('screen_focused', { roomId: args.roomId, mode: args.playbackMode });
      viewerLifecycleLog('viewer_initialization_started', { roomId: args.roomId });
      invalidateBuyerLiveStreamCache(args.roomId);
      invalidateViewerStageToken(args.roomId);
      webrtcUpgradedRef.current = false;
      webrtcFailedRef.current = false;
      webrtcFailoverCountRef.current = 0;
      lastAttachKeyRef.current = '';
      noVideoSinceRef.current = null;
      setVideoHasData(false);
      setPlayerFatal(false);
      setLoading(true);
      setWebrtcSubscribeEpoch((n) => n + 1);
      cancelWebrtcUpgrade();
    }

    // Any transition into the foreground show begins a fresh playback attempt (focus re-entry or a
    // neighbor settling into the active slot). This drives the first-frame watchdog + attempt guard.
    if (prevMode !== 'active' && args.playbackMode === 'active') {
      beginPlaybackAttempt(prevMode === 'off' ? 'focus_reentry' : 'became_active');
    }

    void fetchStream();
    const pollMs = args.playbackMode === 'prefetch' ? PREFETCH_POLL_MS : STREAM_POLL_MS;
    const id = setInterval(() => void fetchStream(), pollMs);
    return () => clearInterval(id);
  }, [
    applyTransport,
    args.accessToken,
    args.playbackMode,
    args.roomId,
    beginPlaybackAttempt,
    fetchStream,
    cancelWebrtcUpgrade,
  ]);

  useEffect(() => {
    if (args.playbackMode === 'off' || args.refreshNonce == null || args.refreshNonce < 1) return;
    clearBackoff();
    retryRef.current = 0;
    lastAttachKeyRef.current = '';
    webrtcFailedRef.current = false;
    webrtcFailoverCountRef.current = 0;
    webrtcUpgradedRef.current = false;
    cancelWebrtcUpgrade();
    noVideoSinceRef.current = null;
    setPlayerFatal(false);
    setPlayerRetryCount(0);
    hideReconnectingUi();
    if (args.playbackMode === 'active') beginPlaybackAttempt('refresh_nonce');
    // Hard refresh after focus re-entry / host signal — recreate Stage subscribe if still on WebRTC.
    if (args.playbackMode === 'active' && transportRef.current === 'webrtc') {
      setWebrtcSubscribeEpoch((n) => n + 1);
    }
    void fetchStream();
  }, [
    args.refreshNonce,
    args.playbackMode,
    beginPlaybackAttempt,
    cancelWebrtcUpgrade,
    clearBackoff,
    fetchStream,
    hideReconnectingUi,
  ]);

  useEffect(() => {
    if (args.playbackMode !== 'active') return undefined;
    let cancelled = false;
    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') {
        clearBackoff();
        cancelWebrtcUpgrade();
        return;
      }
      lastAttachKeyRef.current = '';
      webrtcFailedRef.current = false;
      webrtcFailoverCountRef.current = 0;
      noVideoSinceRef.current = null;
      showReconnectingUi();
      beginPlaybackAttempt('appstate_active');
      if (transportRef.current === 'webrtc') {
        setWebrtcSubscribeEpoch((n) => n + 1);
      } else {
        transportRef.current = 'none';
        applyTransport('none');
      }
      void fetchStream().finally(() => {
        if (!cancelled) hideReconnectingUi();
      });
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [applyTransport, args.playbackMode, beginPlaybackAttempt, clearBackoff, cancelWebrtcUpgrade, fetchStream, hideReconnectingUi, showReconnectingUi]);

  useEffect(() => {
    if (args.playbackMode !== 'active') {
      noVideoSinceRef.current = null;
      return;
    }
    if (videoHasData || !stream || !isLiveStreamSignal(stream.streamHealth)) {
      noVideoSinceRef.current = null;
      return;
    }
    if (noVideoSinceRef.current == null) noVideoSinceRef.current = Date.now();
  }, [args.playbackMode, stream, videoHasData]);

  useEffect(() => {
    if (args.playbackMode !== 'active' || !stream || !isLiveStreamSignal(stream.streamHealth)) return undefined;
    const id = setInterval(() => {
      if (videoHasData) return;
      const since = noVideoSinceRef.current;
      if (since == null || Date.now() - since < NO_VIDEO_RECOVER_MS) return;
      noVideoSinceRef.current = Date.now();
      webrtcFailedRef.current = false;
      webrtcFailoverCountRef.current = 0;
      lastAttachKeyRef.current = '';
      setPlayerFatal(false);
      setPlayerRetryCount(0);
      beginPlaybackAttempt('no_video_recover');
      if (transportRef.current === 'webrtc') {
        setWebrtcSubscribeEpoch((n) => n + 1);
      } else {
        transportRef.current = 'none';
        applyTransport('none');
      }
      void fetchStream();
    }, LIVE_PLAYBACK_HEALTH_MS);
    return () => clearInterval(id);
  }, [applyTransport, args.playbackMode, beginPlaybackAttempt, fetchStream, stream, videoHasData]);

  // Re-entry first-frame watchdog. Keyed on the attempt (not the 2.5s stream poll) so its timers run
  // to completion. Fires: 3s → log slow; 6s → abandon a stalled HLS attempt and force the WebRTC
  // fallback surface; 10s → neither transport produced video, surface a retry action.
  useEffect(() => {
    if (args.playbackMode !== 'active') return undefined;
    if (videoHasData) {
      setReconnectFailed(false);
      return undefined;
    }
    const attemptId = playbackAttemptIdRef.current;
    const stillWaiting = () =>
      playbackAttemptIdRef.current === attemptId &&
      !videoHasDataRef.current &&
      playbackModeRef.current === 'active' &&
      isLiveStreamSignal(streamRef.current?.streamHealth ?? 'offline');

    const slowId = setTimeout(() => {
      if (!stillWaiting()) return;
      viewerLifecycleLog('playback_reconnect_slow', {
        roomId: args.roomId,
        attemptId,
        transport: transportRef.current,
      });
    }, PLAYBACK_RECONNECT_SLOW_MS);

    const forceId = setTimeout(() => {
      if (!stillWaiting()) return;
      // Only force the HLS→WebRTC swap. If we're already on WebRTC, its own rejoin loop owns recovery.
      if (transportRef.current === 'hls') {
        forceWebrtcFallback(attemptId);
      } else {
        viewerLifecycleLog('playback_first_frame_timeout', {
          roomId: args.roomId,
          attemptId,
          transport: transportRef.current,
        });
      }
    }, HLS_FIRST_FRAME_TIMEOUT_MS);

    const failedId = setTimeout(() => {
      if (!stillWaiting()) return;
      viewerLifecycleLog('playback_reconnect_failed', {
        roomId: args.roomId,
        attemptId,
        transport: transportRef.current,
        hlsStalled: hlsStalledRef.current,
      });
      setReconnectFailed(true);
    }, PLAYBACK_RECONNECT_FAILED_MS);

    return () => {
      clearTimeout(slowId);
      clearTimeout(forceId);
      clearTimeout(failedId);
    };
  }, [args.playbackMode, args.roomId, attemptNonce, forceWebrtcFallback, videoHasData]);

  const onVideoReady = useCallback(() => {
    if (!videoHasDataRef.current) {
      viewerLifecycleLog('first_frame_rendered', {
        roomId: args.roomId,
        transport: transportRef.current,
        attemptId: playbackAttemptIdRef.current,
      });
    }
    setVideoHasData(true);
    setReconnectFailed(false);
    hideReconnectingUi();
    setPlayerFatal(false);
    noVideoSinceRef.current = null;
    retryRef.current = 0;
    setPlayerRetryCount(0);
    webrtcFailoverCountRef.current = 0;
    webrtcFailedRef.current = false;
  }, [args.roomId, hideReconnectingUi]);

  const onVideoError = useCallback(() => {
    setPlayerFatal(true);
    setVideoHasData(false);
    const n = retryRef.current + 1;
    if (n <= MAX_PLAYER_RETRIES) {
      retryRef.current = n;
      setPlayerRetryCount(n);
      clearBackoff();
      const delay = Math.min(30_000, PLAYER_BACKOFF_BASE_MS * 2 ** (n - 1));
      backoffTimerRef.current = setTimeout(() => {
        backoffTimerRef.current = null;
        lastAttachKeyRef.current = '';
        void fetchStream();
      }, delay);
    }
  }, [clearBackoff, fetchStream]);

  const onWebrtcFailed = useCallback(
    (reason: string) => {
      if (__DEV__) {
        console.log('[LiveStagePlayback] WebRTC subscribe failed', { reason });
      }
      const exhausted =
        reason.includes('rejoin_exhausted') || reason.includes('connect_timeout');
      webrtcFailoverCountRef.current += exhausted ? 2 : 1;
      setVideoHasData(false);
      hideReconnectingUi();
      if (webrtcFailoverCountRef.current >= 2) {
        webrtcFailedRef.current = true;
        applyTransport('hls');
        lastAttachKeyRef.current = '';
        setVideoHasData(false);
        void fetchStream();
        return;
      }
      applyTransport('webrtc');
      setWebrtcSubscribeEpoch((n) => n + 1);
      showReconnectingUi();
    },
    [applyTransport, fetchStream, hideReconnectingUi, showReconnectingUi],
  );

  const onWebrtcDisconnected = useCallback(() => {
    if (noVideoSinceRef.current == null) noVideoSinceRef.current = Date.now();
    showReconnectingUi();
  }, [showReconnectingUi]);

  useEffect(() => () => {
    clearBackoff();
    clearReconnectUiTimer();
    cancelWebrtcUpgrade();
  }, [clearBackoff, clearReconnectUiTimer, cancelWebrtcUpgrade]);

  const webrtcVideoReady = transport === 'webrtc' && videoHasData;
  const viewerTransport: ViewerTransportState =
    reconnectFailed && !videoHasData
      ? 'failed'
      : transport === 'hls'
        ? videoHasData
          ? 'hls-playing'
          : 'hls-loading'
        : transport === 'webrtc'
          ? videoHasData
            ? 'webrtc-video-ready'
            : 'webrtc-joining'
          : 'idle';

  return {
    loading,
    fetchFailed,
    reconnecting,
    reconnectFailed,
    stream,
    transport,
    viewerTransport,
    webrtcVideoReady,
    videoHasData,
    playerFatal,
    playerRetryCount,
    playbackAttemptId: playbackAttemptIdRef.current,
    onVideoReady,
    onVideoError,
    onWebrtcFailed,
    onWebrtcDisconnected,
    webrtcSubscribeEpoch,
    retry,
    refetch: fetchStream,
  };
}
