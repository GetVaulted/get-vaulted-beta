import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { fetchBuyerLiveStream } from '../api/liveRoomStreamRepository';
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

export function useLiveStagePlayback(args: {
  roomId: string;
  enabled: boolean;
  accessToken?: string;
  refreshNonce?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [stream, setStream] = useState<BuyerSafeStreamFields | null>(null);
  const [transport, setTransport] = useState<LivePlaybackTransport>('none');
  const [videoHasData, setVideoHasData] = useState(false);
  const [playerFatal, setPlayerFatal] = useState(false);
  const [playerRetryCount, setPlayerRetryCount] = useState(0);

  const retryRef = useRef(0);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttachKeyRef = useRef('');
  const transportRef = useRef<LivePlaybackTransport>('none');
  const webrtcFailedRef = useRef(false);

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
    if (!args.enabled || !args.roomId) return;
    try {
      const safe = await fetchBuyerLiveStream(args.roomId, args.accessToken);
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
      }

      const wantWebrtc = shouldUseStageWebrtcPlayback(safe, webrtcFailedRef.current, args.accessToken);
      if (wantWebrtc) {
        applyTransport('webrtc');
        lastAttachKeyRef.current = '';
        setPlayerFatal(false);
        return;
      }

      const attachKey = `${safe.playbackUrl ?? ''}|${safe.streamHealth}`;
      if (shouldAttachHlsPlayback(safe.streamHealth, safe.playbackUrl)) {
        applyTransport('hls');
        if (lastAttachKeyRef.current !== attachKey) {
          lastAttachKeyRef.current = attachKey;
          setVideoHasData(false);
          setPlayerFatal(false);
        }
      } else {
        applyTransport(isLiveStreamSignal(safe.streamHealth) ? 'waiting' : 'none');
        lastAttachKeyRef.current = '';
        setVideoHasData(false);
      }
    } catch {
      setFetchFailed(true);
      setLoading(false);
      applyTransport('none');
    }
  }, [applyTransport, args.accessToken, args.enabled, args.roomId]);

  useEffect(() => {
    if (!args.enabled) {
      applyTransport('none');
      webrtcFailedRef.current = false;
      return undefined;
    }
    void fetchStream();
    const id = setInterval(() => void fetchStream(), STREAM_POLL_MS);
    return () => clearInterval(id);
  }, [applyTransport, args.enabled, fetchStream]);

  useEffect(() => {
    if (!args.enabled || args.refreshNonce == null || args.refreshNonce < 1) return;
    clearBackoff();
    retryRef.current = 0;
    lastAttachKeyRef.current = '';
    setPlayerFatal(false);
    setPlayerRetryCount(0);
    setVideoHasData(false);
    void fetchStream();
  }, [args.refreshNonce, args.enabled, clearBackoff, fetchStream]);

  useEffect(() => {
    if (!args.enabled) return undefined;
    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active') {
        clearBackoff();
        return;
      }
      lastAttachKeyRef.current = '';
      setReconnecting(true);
      void fetchStream().finally(() => {
        setTimeout(() => setReconnecting(false), 600);
      });
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => sub.remove();
  }, [args.enabled, clearBackoff, fetchStream]);

  const onVideoReady = useCallback(() => {
    setVideoHasData(true);
    setPlayerFatal(false);
    retryRef.current = 0;
    setPlayerRetryCount(0);
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
        console.log('[LiveStagePlayback] WebRTC subscribe failed, falling back to HLS', { reason });
      }
      webrtcFailedRef.current = true;
      applyTransport('waiting');
      lastAttachKeyRef.current = '';
      setVideoHasData(false);
      void fetchStream();
    },
    [applyTransport, fetchStream],
  );

  const onWebrtcDisconnected = useCallback(() => {
    webrtcFailedRef.current = true;
    setVideoHasData(false);
    applyTransport('waiting');
    void fetchStream();
  }, [applyTransport, fetchStream]);

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
    refetch: fetchStream,
  };
}
