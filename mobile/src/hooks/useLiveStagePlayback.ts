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
  HOST_AWAY_NO_VIDEO_MS,
  HLS_FIRST_FRAME_TIMEOUT_MS,
  MAX_PLAYER_RETRIES,
  PLAYBACK_RECONNECT_FAILED_MS,
  PLAYBACK_RECONNECT_SLOW_MS,
  PLAYER_BACKOFF_BASE_MS,
  STREAM_POLL_MS,
  WEBRTC_UPGRADE_DWELL_MS,
  clearBuyerStageSubscribeTornDown,
  isBuyerStageWebrtcRejoinBlocked,
  isHybridLiveEnabled,
  isLiveStreamSignal,
  mergeRealtimeStreamPaused,
  resolveSurfaceTransportPlan,
  shouldAttachHlsPlayback,
  shouldTreatAsLocalHostAway,
  shouldUseStageWebrtcPlayback,
  type BuyerSafeStreamFields,
  type LivePlaybackTransport,
  type ViewerTransportState,
} from '../lib/liveStreamPlayback';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';
import { shouldCommitLiveBackgroundAfterDwell } from '../lib/livePlaybackAppState';
import { isLivePlaybackCommerceHoldActive } from '../lib/livePlaybackCommerceHold';

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
  roomId: string;
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
    roomId: args.roomId,
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
  /** Local Host paused when frames stop but server streamPaused never arrived. */
  const [localHostAway, setLocalHostAway] = useState(false);
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
      // Background leave latches rejoin — upgrading would remount a poisoned Stage singleton.
      if (isBuyerStageWebrtcRejoinBlocked(args.roomId)) return;
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
      // Do NOT clear hlsStalledRef here. Host resume / forceWebrtcFallback set it so
      // fetchStream prefers WebRTC over a cold HLS mirror. Clearing it stranded buyers
      // on "Waiting for host video" after Play.
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
      streamRef.current = safe;
      setLoading(false);
      retryRef.current = 0;
      setPlayerRetryCount(0);
      // Host pause: keep WebRTC subscribed (keep-session-alive). Parking to `none` unmounted
      // Stage, leave-latched buyers, and left them stuck after Play.
      if (safe.streamPaused) {
        setReconnectFailed(false);
        setLocalHostAway(false);
        cancelWebrtcUpgrade();
        const keepWebrtc =
          args.playbackMode === 'active' &&
          (transportRef.current === 'webrtc' ||
            shouldUseStageWebrtcPlayback(safe, webrtcFailedRef.current, args.accessToken));
        if (keepWebrtc) {
          webrtcUpgradedRef.current = true;
          hlsStalledRef.current = true;
          applyTransport('webrtc');
        }
        viewerLifecycleLog('playback_url_received', {
          roomId: args.roomId,
          playbackUrl: safe.playbackUrl,
          streamHealth: safe.streamHealth,
          streamMode: safe.streamMode,
          stageAvailable: safe.stageAvailable,
          streamPaused: true,
        });
        viewerLifecycleLog('viewer_playback_plan', {
          showId: args.roomId,
          roomVisitNonce: args.roomVisitNonce ?? null,
          refreshNonce: args.refreshNonce ?? null,
          screenFocused: args.playbackMode === 'active',
          playbackMode: args.playbackMode,
          showLive: isLiveStreamSignal(safe.streamHealth),
          streamHealth: safe.streamHealth,
          selectedTransport: keepWebrtc ? 'webrtc' : transportRef.current,
          selectionReason: 'host_paused_keep_session',
          playbackAttemptId: playbackAttemptIdRef.current,
        });
        return;
      }
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
        roomId: args.roomId,
      });

      // Full playback plan for the second (and every) room visit — see required investigation.
      const rejoinBlocked = isBuyerStageWebrtcRejoinBlocked(args.roomId);
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
              : plan.transport === 'webrtc'
                ? 'webrtc_first'
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
        roomId: args.roomId,
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
  // After a buyer Stage leave (home swipe), never force WebRTC — remount thrash is worse than a
  // slow HLS reload.
  const forceWebrtcFallback = useCallback(
    (attemptId: number) => {
      if (playbackAttemptIdRef.current !== attemptId) return;
      if (videoHasDataRef.current) return;
      const safe = streamRef.current;
      if (safe?.streamPaused) return;
      // Post-background latch preferred HLS first. If that mirror never painted, clear the latch
      // and remount Stage once — otherwise buyers stay on "Waiting…" until force-quit.
      if (isBuyerStageWebrtcRejoinBlocked(args.roomId)) {
        clearBuyerStageSubscribeTornDown(args.roomId);
        viewerLifecycleLog('playback_fallback_cleared_rejoin_latch', {
          roomId: args.roomId,
          attemptId,
        });
      }
      if (!safe || !shouldUseStageWebrtcPlayback(safe, false, args.accessToken)) {
        viewerLifecycleLog('playback_fallback_unavailable', {
          roomId: args.roomId,
          attemptId,
          reason: safe ? 'not_webrtc_eligible' : 'no_stream',
        });
        // Stay on / re-attach HLS when WebRTC isn't an option.
        hlsStalledRef.current = false;
        lastAttachKeyRef.current = '';
        setPlayerFatal(false);
        if (transportRef.current !== 'hls') {
          applyTransport('hls');
        }
        void fetchStream();
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
    [applyTransport, args.accessToken, args.roomId, fetchStream, showReconnectingUi],
  );

  const retry = useCallback(() => {
    const id = beginPlaybackAttempt('manual_retry');
    invalidateBuyerLiveStreamCache(args.roomId);
    invalidateViewerStageToken(args.roomId);
    clearBuyerStageSubscribeTornDown(args.roomId);
    clearBackoff();
    retryRef.current = 0;
    setPlayerRetryCount(0);
    webrtcFailedRef.current = false;
    webrtcFailoverCountRef.current = 0;
    webrtcUpgradedRef.current = false;
    hlsStalledRef.current = false;
    lastAttachKeyRef.current = '';
    noVideoSinceRef.current = null;
    setPlayerFatal(false);
    setVideoHasData(false);
    setReconnectFailed(false);
    setLoading(true);
    // Destroy HLS + leave Stage by dropping to 'none', bump the epoch so the native subscriber
    // surface remounts fresh, then refetch and re-plan (HLS first, WebRTC fallback).
    transportRef.current = 'none';
    applyTransport('none');
    setWebrtcSubscribeEpoch((n) => n + 1);
    hideReconnectingUi();
    viewerLifecycleLog('playback_retry_requested', { roomId: args.roomId, attemptId: id });
    void fetchStream();
  }, [applyTransport, args.roomId, beginPlaybackAttempt, clearBackoff, fetchStream, hideReconnectingUi]);

  // Keep trying while the room is live. Only stop the loop for real server Host paused.
  useEffect(() => {
    if (args.playbackMode !== 'active' || !reconnectFailed) return undefined;
    if (stream?.streamPaused) return undefined;
    const id = setInterval(() => {
      retry();
    }, 8_000);
    return () => clearInterval(id);
  }, [args.playbackMode, reconnectFailed, retry, stream?.streamPaused]);

  // Soft "host away" for watchdog only — never blocks reconnect and never drives Host paused UI.
  useEffect(() => {
    if (args.playbackMode !== 'active') {
      setLocalHostAway(false);
      return undefined;
    }
    if (videoHasData || stream?.streamPaused) {
      setLocalHostAway(false);
      noVideoSinceRef.current = null;
      return undefined;
    }
    if (!isLiveStreamSignal(stream?.streamHealth ?? 'offline')) {
      setLocalHostAway(false);
      return undefined;
    }
    if (noVideoSinceRef.current == null) noVideoSinceRef.current = Date.now();
    const tick = () => {
      const since = noVideoSinceRef.current;
      const msWithoutVideo = since == null ? null : Date.now() - since;
      const away = shouldTreatAsLocalHostAway({
        playbackActive: true,
        roomLifecycleLive: isLiveStreamSignal(streamRef.current?.streamHealth ?? 'offline'),
        serverStreamPaused: streamRef.current?.streamPaused === true,
        videoHasData: videoHasDataRef.current,
        msWithoutVideo,
      });
      setLocalHostAway(away);
      // Do not clear reconnectFailed here — buyers must keep recovering until frames arrive.
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [args.playbackMode, stream?.streamHealth, stream?.streamPaused, videoHasData]);

  const applyRealtimeStreamPaused = useCallback((paused: boolean) => {
    setStream((prev) => {
      const next = mergeRealtimeStreamPaused(prev, paused);
      // Keep streamRef in sync immediately — refreshNonce can fire in the same tick.
      streamRef.current = next;
      return next;
    });
    if (paused) {
      setReconnectFailed(false);
      setLocalHostAway(false);
      setVideoHasData(false);
      cancelWebrtcUpgrade();
      // Keep WebRTC subscribed through Host paused — do not leaveStage / park to none.
      if (args.playbackMode === 'active') {
        webrtcUpgradedRef.current = true;
        hlsStalledRef.current = true;
        if (transportRef.current === 'none' || transportRef.current === 'waiting') {
          applyTransport('webrtc');
        } else if (transportRef.current === 'hls') {
          applyTransport('webrtc');
        }
      }
      return;
    }
    // Host tapped Play: stay on the same Stage subscribe when possible.
    clearBuyerStageSubscribeTornDown(args.roomId);
    invalidateBuyerLiveStreamCache(args.roomId);
    invalidateViewerStageToken(args.roomId);
    clearBackoff();
    retryRef.current = 0;
    webrtcFailedRef.current = false;
    webrtcFailoverCountRef.current = 0;
    webrtcUpgradedRef.current = true;
    hlsStalledRef.current = true; // prefer WebRTC over a starved HLS mirror
    noVideoSinceRef.current = null;
    setLocalHostAway(false);
    setReconnectFailed(false);
    setPlayerFatal(false);
    setPlayerRetryCount(0);
    hideReconnectingUi();
    if (args.playbackMode === 'active') {
      const alreadyOnWebrtc = transportRef.current === 'webrtc';
      beginPlaybackAttempt(alreadyOnWebrtc ? 'host_resume_soft' : 'host_resume');
      hlsStalledRef.current = true;
      webrtcUpgradedRef.current = true;
      if (!alreadyOnWebrtc) {
        lastAttachKeyRef.current = '';
        setVideoHasData(false);
        setWebrtcSubscribeEpoch((n) => n + 1);
        applyTransport('webrtc');
      }
      // Soft resume: same subscribe — frames return when host republishes; no remount thrash.
    }
    void fetchStream();
  }, [
    applyTransport,
    args.playbackMode,
    args.roomId,
    beginPlaybackAttempt,
    cancelWebrtcUpgrade,
    clearBackoff,
    fetchStream,
    hideReconnectingUi,
  ]);

  useEffect(() => {
    if (args.playbackMode === 'off' || args.refreshNonce == null || args.refreshNonce < 1) return;
    // Drop stale prefetch so pause/resume from realtime is not served for up to 5s.
    invalidateBuyerLiveStreamCache(args.roomId);
    invalidateViewerStageToken(args.roomId);
    // While Host paused: refresh metadata only — remounting Stage poisons rejoin after Play.
    if (streamRef.current?.streamPaused === true) {
      void fetchStream();
      return;
    }
    // Already painting: metadata refresh only. Remounting here caused random black → Loading flashes
    // whenever stream_status / reconnect bumped refreshNonce during a healthy show.
    if (videoHasDataRef.current && transportRef.current !== 'none') {
      void fetchStream();
      return;
    }
    // Soft host-resume already on WebRTC: don't remount — wait for republished frames.
    if (transportRef.current === 'webrtc' && hlsStalledRef.current) {
      void fetchStream();
      return;
    }
    // Buyer already left Stage this session (home swipe / suspend): try HLS first.
    // Do not clear the latch here — the first-frame watchdog clears it if HLS stalls.
    if (isBuyerStageWebrtcRejoinBlocked(args.roomId)) {
      webrtcUpgradedRef.current = false;
      hlsStalledRef.current = false;
      cancelWebrtcUpgrade();
      if (playbackModeRef.current === 'active') beginPlaybackAttempt('refresh_nonce_hls');
      if (transportRef.current !== 'hls') {
        lastAttachKeyRef.current = '';
        transportRef.current = 'none';
        applyTransport('none');
      }
      void fetchStream();
      return;
    }
    clearBackoff();
    retryRef.current = 0;
    lastAttachKeyRef.current = '';
    webrtcFailedRef.current = false;
    webrtcFailoverCountRef.current = 0;
    webrtcUpgradedRef.current = true;
    cancelWebrtcUpgrade();
    noVideoSinceRef.current = null;
    setPlayerFatal(false);
    setPlayerRetryCount(0);
    setVideoHasData(false);
    hideReconnectingUi();
    // Host Play after pause: always allow WebRTC again (pause teardown sets the block latch).
    clearBuyerStageSubscribeTornDown(args.roomId);
    hlsStalledRef.current = true;
    if (playbackModeRef.current === 'active') beginPlaybackAttempt('refresh_nonce');
    hlsStalledRef.current = true;
    // Always remount Stage subscribe on hard refresh — not only when already on WebRTC.
    if (playbackModeRef.current === 'active') {
      setWebrtcSubscribeEpoch((n) => n + 1);
      applyTransport('webrtc');
    }
    void fetchStream();
    // Intentionally omit playbackMode: swipe active↔prefetch must not hard-remount Stage / nuke HLS.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshNonce / roomId own this recovery path
  }, [
    args.refreshNonce,
    args.roomId,
    applyTransport,
    beginPlaybackAttempt,
    cancelWebrtcUpgrade,
    clearBackoff,
    fetchStream,
    hideReconnectingUi,
  ]);

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

    // Focus / re-entry: keep warm prefetch when available — wipe only Stage token if expired.
    // Invalidating stream+token on every off→active forced a cold GET and made discovery opens slow.
    if (prevMode === 'off') {
      viewerLifecycleLog('screen_focused', { roomId: args.roomId, mode: args.playbackMode });
      viewerLifecycleLog('viewer_initialization_started', { roomId: args.roomId });
      const cached = peekCachedBuyerLiveStream(args.roomId);
      const cacheAge = peekBuyerLiveStreamCacheAgeMs(args.roomId);
      if (!cached || cacheAge == null || cacheAge > 15_000) {
        invalidateBuyerLiveStreamCache(args.roomId);
      }
      if (!peekPrefetchedViewerStageToken(args.roomId)) {
        invalidateViewerStageToken(args.roomId);
      }
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
    if (args.playbackMode !== 'active') return undefined;
    let cancelled = false;
    let backgroundAtMs: number | null = null;
    const onAppState = (next: AppStateStatus) => {
      if (next === 'background') {
        // Stripe PaymentSheet / confirmPayment reports background on Android — not a home leave.
        if (isLivePlaybackCommerceHoldActive()) {
          clearBackoff();
          cancelWebrtcUpgrade();
          return;
        }
        backgroundAtMs = Date.now();
        clearBackoff();
        cancelWebrtcUpgrade();
        return;
      }
      if (next !== 'active') {
        clearBackoff();
        cancelWebrtcUpgrade();
        return;
      }
      const dwellMs = backgroundAtMs != null ? Date.now() - backgroundAtMs : 0;
      backgroundAtMs = null;
      // Checkout returned: keep existing transport (do not park HLS / leave latch).
      if (isLivePlaybackCommerceHoldActive()) {
        void fetchStream();
        return;
      }
      // Brief exit→return: keep the existing Stage session — hard remount crashes native IVS.
      if (!shouldCommitLiveBackgroundAfterDwell(dwellMs)) {
        void fetchStream();
        return;
      }
      if (streamRef.current?.streamPaused) {
        void fetchStream();
        return;
      }
      lastAttachKeyRef.current = '';
      webrtcFailedRef.current = false;
      webrtcFailoverCountRef.current = 0;
      noVideoSinceRef.current = null;
      // Committed background leaves Stage (see LiveStagePlayback suspend). Never remount WebRTC
      // here — that start/stops on a poisoned singleton until force-close. Park on HLS instead.
      webrtcUpgradedRef.current = false;
      hlsStalledRef.current = false;
      cancelWebrtcUpgrade();
      showReconnectingUi();
      beginPlaybackAttempt('appstate_active');
      transportRef.current = 'none';
      applyTransport('none');
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
    if (stream.streamPaused) return undefined;
    const id = setInterval(() => {
      if (videoHasData) return;
      if (streamRef.current?.streamPaused) return;
      const since = noVideoSinceRef.current;
      if (since == null || Date.now() - since < NO_VIDEO_RECOVER_MS) return;
      noVideoSinceRef.current = Date.now();
      webrtcFailedRef.current = false;
      webrtcFailoverCountRef.current = 0;
      lastAttachKeyRef.current = '';
      setPlayerFatal(false);
      setPlayerRetryCount(0);
      beginPlaybackAttempt('no_video_recover');
      // Always remount: drop to none so HLS replace / WebRTC plan runs again. Never idle forever.
      webrtcUpgradedRef.current = false;
      hlsStalledRef.current = false;
      cancelWebrtcUpgrade();
      transportRef.current = 'none';
      applyTransport('none');
      if (!isBuyerStageWebrtcRejoinBlocked(args.roomId)) {
        setWebrtcSubscribeEpoch((n) => n + 1);
      }
      void fetchStream();
    }, LIVE_PLAYBACK_HEALTH_MS);
    return () => clearInterval(id);
  }, [
    applyTransport,
    args.playbackMode,
    args.roomId,
    beginPlaybackAttempt,
    cancelWebrtcUpgrade,
    fetchStream,
    stream,
    videoHasData,
  ]);

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
    // Soft localHostAway must NOT abort recovery after Play — that left buyers on
    // "Waiting for host video" forever when HLS was cold and WebRTC never forced.
    const stillWaiting = () =>
      playbackAttemptIdRef.current === attemptId &&
      !videoHasDataRef.current &&
      playbackModeRef.current === 'active' &&
      !streamRef.current?.streamPaused &&
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
    setLocalHostAway(false);
    hideReconnectingUi();
    setPlayerFatal(false);
    noVideoSinceRef.current = null;
    retryRef.current = 0;
    setPlayerRetryCount(0);
    webrtcFailoverCountRef.current = 0;
    webrtcFailedRef.current = false;
    hlsStalledRef.current = false;
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
      if (isBuyerStageWebrtcRejoinBlocked(args.roomId) || webrtcFailoverCountRef.current >= 2) {
        webrtcFailedRef.current = true;
        webrtcUpgradedRef.current = false;
        hlsStalledRef.current = false;
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
    localHostAway,
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
    applyRealtimeStreamPaused,
    retry,
    refetch: fetchStream,
  };
}
