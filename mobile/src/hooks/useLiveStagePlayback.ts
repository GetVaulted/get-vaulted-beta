import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { fetchBuyerLiveStream } from '../api/liveRoomStreamRepository';
import {
  MAX_PLAYER_RETRIES,
  PLAYER_BACKOFF_BASE_MS,
  STREAM_POLL_MS,
  shouldAttachHlsPlayback,
  type BuyerSafeStreamFields,
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
  const [videoHasData, setVideoHasData] = useState(false);
  const [playerFatal, setPlayerFatal] = useState(false);
  const [playerRetryCount, setPlayerRetryCount] = useState(0);

  const retryRef = useRef(0);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAttachKeyRef = useRef('');

  const clearBackoff = useCallback(() => {
    if (backoffTimerRef.current != null) {
      clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
  }, []);

  const fetchStream = useCallback(async () => {
    if (!args.enabled || !args.roomId) return;
    try {
      const safe = await fetchBuyerLiveStream(args.roomId, args.accessToken);
      if (!safe) {
        setFetchFailed(true);
        setLoading(false);
        return;
      }
      setFetchFailed(false);
      setStream(safe);
      setLoading(false);
      retryRef.current = 0;
      setPlayerRetryCount(0);

      const attachKey = `${safe.playbackUrl ?? ''}|${safe.streamHealth}`;
      if (!shouldAttachHlsPlayback(safe.streamHealth, safe.playbackUrl)) {
        lastAttachKeyRef.current = '';
        setVideoHasData(false);
      } else if (lastAttachKeyRef.current !== attachKey) {
        lastAttachKeyRef.current = attachKey;
        setVideoHasData(false);
        setPlayerFatal(false);
      }
    } catch {
      setFetchFailed(true);
      setLoading(false);
    }
  }, [args.accessToken, args.enabled, args.roomId]);

  useEffect(() => {
    if (!args.enabled) return undefined;
    void fetchStream();
    const id = setInterval(() => void fetchStream(), STREAM_POLL_MS);
    return () => clearInterval(id);
  }, [args.enabled, fetchStream]);

  useEffect(() => {
    if (!args.enabled || args.refreshNonce == null || args.refreshNonce < 1) return;
    clearBackoff();
    retryRef.current = 0;
    lastAttachKeyRef.current = '';
    setPlayerFatal(false);
    setPlayerRetryCount(0);
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

  useEffect(() => () => clearBackoff(), [clearBackoff]);

  return {
    loading,
    fetchFailed,
    reconnecting,
    stream,
    videoHasData,
    playerFatal,
    playerRetryCount,
    onVideoReady,
    onVideoError,
    refetch: fetchStream,
  };
}
