import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  getBuyerLiveStreamCached,
  peekCachedBuyerLiveStream,
} from '../lib/liveStreamPrefetchCache';
import {
  MAX_PLAYER_RETRIES,
  PLAYER_BACKOFF_BASE_MS,
  STREAM_POLL_MS,
  shouldAttachHlsPlayback,
  shouldUseStageWebrtcPlayback,
  isLiveStreamSignal,
  type BuyerSafeStreamFields,
  type LivePlaybackTransport,
} from '../lib/liveStreamPlayback';

export type LivePlaybackMode = 'active' | 'prefetch' | 'off';

const PREFETCH_POLL_MS = 10_000;

function applyStreamToTransport(args: {
  safe: BuyerSafeStreamFields;
  accessToken?: string;
  webrtcFailed: boolean;
  lastAttachKeyRef: React.MutableRefObject<string>;
  applyTransport: (next: LivePlaybackTransport) => void;
  setPlayerFatal: (v: boolean) => void;
  setVideoHasData: (v: boolean) => void;
}) {
  const wantWebrtc = shouldUseStageWebrtcPlayback(args.safe, args.webrtcFailed, args.accessToken);
  if (wantWebrtc) {
    args.applyTransport('webrtc');
    args.lastAttachKeyRef.current = '';
    args.setPlayerFatal(false);
    return;
  }

  const attachKey = `${args.safe.playbackUrl ?? ''}|${args.safe.streamHealth}`;
  if (shouldAttachHlsPlayback(args.safe.streamHealth, args.safe.playbackUrl)) {
    args.applyTransport('hls');
    if (args.lastAttachKeyRef.current !== attachKey) {
      args.lastAttachKeyRef.current = attachKey;
      args.setVideoHasData(false);
      args.setPlayerFatal(false);
    }
  } else {
    args.applyTransport(isLiveStreamSignal(args.safe.streamHealth) ? 'waiting' : 'none');
    args.lastAttachKeyRef.current = '';
    args.setVideoHasData(false);
  }
}

export function useLiveStagePlayback(args: {
  roomId: string;
  /** `prefetch` keeps the next/prev show warm while off-screen; `off` tears down. */
  playbackMode: LivePlaybackMode;
  accessToken?: string;
  refreshNonce?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
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
  const playbackModeRef = useRef(args.playbackMode);
  const [webrtcSubscribeEpoch, setWebrtcSubscribeEpoch] = useState(0);

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

  const fetchStream = useCallback(async () => {
    if (args.playbackMode === 'off' || !args.roomId) return;

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

      if (!isLiveStreamSignal(safe.streamHealth)) {
        webrtcFailedRef.current = false;
        webrtcFailoverCountRef.current = 0;
      }

      applyStreamToTransport({
        safe,
        accessToken: args.accessToken,
        webrtcFailed: webrtcFailedRef.current,
        lastAttachKeyRef,
        applyTransport,
        setPlayerFatal,
        setVideoHasData,
      });
    } catch {
      setFetchFailed(true);
      setLoading(false);
      applyTransport('none');
    }
  }, [applyTransport, args.accessToken, args.playbackMode, args.roomId]);

  useEffect(() => {
    const prevMode = playbackModeRef.current;
    playbackModeRef.current = args.playbackMode;

    if (args.playbackMode === 'off') {
      if (prevMode !== 'off') {
        applyTransport('none');
        webrtcFailedRef.current = false;
        webrtcFailoverCountRef.current = 0;
        setWebrtcSubscribeEpoch(0);
      }
      return undefined;
    }

    if (prevMode === 'off') {
      const cached = peekCachedBuyerLiveStream(args.roomId);
      if (cached) {
        setStream(cached);
        setLoading(false);
        applyStreamToTransport({
          safe: cached,
          accessToken: args.accessToken,
          webrtcFailed: webrtcFailedRef.current,
          lastAttachKeyRef,
          applyTransport,
          setPlayerFatal,
          setVideoHasData,
        });
      }
    }

    void fetchStream();
    const pollMs = args.playbackMode === 'prefetch' ? PREFETCH_POLL_MS : STREAM_POLL_MS;
    const id = setInterval(() => void fetchStream(), pollMs);
    return () => clearInterval(id);
  }, [applyTransport, args.accessToken, args.playbackMode, args.roomId, fetchStream]);

  useEffect(() => {
    if (args.playbackMode === 'off' || args.refreshNonce == null || args.refreshNonce < 1) return;
    clearBackoff();
    retryRef.current = 0;
    lastAttachKeyRef.current = '';
    setPlayerFatal(false);
    setPlayerRetryCount(0);
    if (args.playbackMode === 'active') {
      setVideoHasData(false);
    }
    setWebrtcSubscribeEpoch((n) => n + 1);
    void fetchStream();
  }, [args.refreshNonce, args.playbackMode, clearBackoff, fetchStream]);

  useEffect(() => {
    if (args.playbackMode !== 'active') return undefined;
    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') {
        clearBackoff();
        return;
      }
      lastAttachKeyRef.current = '';
      setReconnecting(true);
      if (transportRef.current === 'webrtc') {
        setWebrtcSubscribeEpoch((n) => n + 1);
      }
      void fetchStream().finally(() => {
        setTimeout(() => setReconnecting(false), 600);
      });
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [args.playbackMode, clearBackoff, fetchStream]);

  const onVideoReady = useCallback(() => {
    setVideoHasData(true);
    setPlayerFatal(false);
    retryRef.current = 0;
    setPlayerRetryCount(0);
    webrtcFailoverCountRef.current = 0;
  }, []);

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
      webrtcFailoverCountRef.current += 1;
      setVideoHasData(false);
      setReconnecting(false);
      if (webrtcFailoverCountRef.current >= 2) {
        webrtcFailedRef.current = true;
        applyTransport('waiting');
        lastAttachKeyRef.current = '';
        void fetchStream();
        return;
      }
      applyTransport('webrtc');
      setWebrtcSubscribeEpoch((n) => n + 1);
      setReconnecting(true);
      setTimeout(() => setReconnecting(false), 800);
    },
    [applyTransport, fetchStream],
  );

  const onWebrtcDisconnected = useCallback(() => {
    setVideoHasData(false);
    setReconnecting(true);
  }, []);

  useEffect(() => () => clearBackoff(), [clearBackoff]);

  return {
    loading,
    fetchFailed,
    reconnecting,
    stream,
    transport,
    videoHasData,
    playerFatal,
    playerRetryCount,
    onVideoReady,
    onVideoError,
    onWebrtcFailed,
    onWebrtcDisconnected,
    webrtcSubscribeEpoch,
    refetch: fetchStream,
  };
}
