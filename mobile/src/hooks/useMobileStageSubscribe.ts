import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addOnStageConnectionStateChangedListener,
  addOnStageErrorListener,
  joinStage,
  leaveStage,
  useStageParticipants,
} from 'expo-realtime-ivs-broadcast';
import { invalidateViewerStageToken, resolveViewerStageToken } from '../lib/liveStreamPrefetchCache';
import { ensureStageSdkInitialized } from '../lib/stageSdk';

/** If no remote media arrives within this window, retry before failing over to HLS. */
const CONNECT_TIMEOUT_MS = 12_000;
/** When signed out, do not block on WebRTC forever — fail over to HLS for guests. */
const AUTH_WAIT_MS = 1_500;
/** Max automatic rejoin attempts inside the hook before reporting failure upstream. */
const MAX_REJOIN_ATTEMPTS = 12;
/** Proactive token refresh before the 20-minute viewer TTL expires. */
const TOKEN_REFRESH_MS = 17 * 60 * 1000;
/** Remote video missing this long while still "connected" triggers a rejoin. */
const REMOTE_VIDEO_LOST_MS = 5_000;
const REMOTE_VIDEO_CHECK_MS = 2_000;

export type MobileStageRemoteTarget = {
  participantId: string;
  deviceUrn: string;
} | null;

export type MobileStageSubscribePhase = 'idle' | 'connecting' | 'connected' | 'failed';

/**
 * Buyer-side native IVS Real-Time Stage subscriber (Expo iOS/Android).
 * Fetches a subscribe-only token, joins the stage without publishing, and surfaces the
 * first remote participant's video stream for `ExpoIVSRemoteStreamView`.
 */
export function useMobileStageSubscribe(args: {
  roomId: string;
  accessToken?: string;
  active: boolean;
  refreshNonce?: number;
  subscribeEpoch?: number;
  onConnected: () => void;
  onFailed: (reason: string) => void;
  onDisconnected: () => void;
}) {
  const [phase, setPhase] = useState<MobileStageSubscribePhase>('idle');
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>(
    'disconnected',
  );
  const connectedRef = useRef(false);
  const rejoinRef = useRef<(trigger: string) => void>(() => {});
  const cbRef = useRef(args);
  cbRef.current = args;
  const { participants } = useStageParticipants();

  const remoteVideo = useMemo((): MobileStageRemoteTarget => {
    for (const participant of participants) {
      const video = participant.streams.find((s) => s.mediaType === 'video');
      if (video) {
        return { participantId: participant.id, deviceUrn: video.deviceUrn };
      }
    }
    return null;
  }, [participants]);

  useEffect(() => {
    if (remoteVideo && connectionState === 'connected' && !connectedRef.current) {
      connectedRef.current = true;
      setPhase('connected');
      cbRef.current.onConnected();
    }
  }, [remoteVideo, connectionState]);

  useEffect(() => {
    if (!args.active || !connectedRef.current) return undefined;
    let lostSince: number | null = remoteVideo ? null : Date.now();
    const id = setInterval(() => {
      if (!connectedRef.current) return;
      if (remoteVideo) {
        lostSince = null;
        return;
      }
      if (lostSince == null) lostSince = Date.now();
      else if (Date.now() - lostSince >= REMOTE_VIDEO_LOST_MS) {
        lostSince = null;
        rejoinRef.current('remote_video_lost');
      }
    }, REMOTE_VIDEO_CHECK_MS);
    return () => clearInterval(id);
  }, [remoteVideo, args.active]);

  useEffect(() => {
    if (!args.active) {
      connectedRef.current = false;
      setPhase('idle');
      setConnectionState('disconnected');
      void leaveStage().catch(() => {
        /* stage may already be left */
      });
      return;
    }

    let cancelled = false;
    let connectTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let tokenRefreshId: ReturnType<typeof setTimeout> | null = null;
    let rejoinAttempts = 0;
    let rejoinInFlight = false;
    let connSub: { remove: () => void } | null = null;
    let errSub: { remove: () => void } | null = null;

    const clearTimers = () => {
      if (connectTimeoutId != null) {
        clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
      }
      if (tokenRefreshId != null) {
        clearTimeout(tokenRefreshId);
        tokenRefreshId = null;
      }
    };

    const teardownListeners = () => {
      connSub?.remove();
      errSub?.remove();
      connSub = null;
      errSub = null;
    };

    const fail = (reason: string) => {
      if (cancelled) return;
      connectedRef.current = false;
      setPhase('failed');
      setConnectionState('disconnected');
      void leaveStage().catch(() => {
        /* ignore */
      });
      cbRef.current.onFailed(reason);
    };

    const scheduleTokenRefresh = () => {
      if (tokenRefreshId != null) clearTimeout(tokenRefreshId);
      tokenRefreshId = setTimeout(() => {
        if (cancelled || !connectedRef.current) return;
        void attemptRejoin('token_refresh');
      }, TOKEN_REFRESH_MS);
    };

    const attemptRejoin = async (trigger: string) => {
      if (cancelled || rejoinInFlight) return;
      if (rejoinAttempts >= MAX_REJOIN_ATTEMPTS) {
        fail(`rejoin_exhausted_${trigger}`);
        return;
      }
      rejoinAttempts += 1;
      rejoinInFlight = true;
      invalidateViewerStageToken(args.roomId);
      connectedRef.current = false;
      setPhase('connecting');
      setConnectionState('connecting');
      cbRef.current.onDisconnected();
      clearTimers();
      teardownListeners();
      try {
        await leaveStage().catch(() => {
          /* ignore */
        });
        if (cancelled) return;
        await joinOnce();
      } finally {
        rejoinInFlight = false;
      }
    };

    rejoinRef.current = (trigger: string) => {
      void attemptRejoin(trigger);
    };

    const joinOnce = async () => {
      if (cancelled) return;

      if (!args.accessToken?.trim()) {
        setPhase('idle');
        connectTimeoutId = setTimeout(() => fail('auth_required'), AUTH_WAIT_MS);
        return;
      }

      setPhase('connecting');
      setConnectionState('connecting');

      connSub = addOnStageConnectionStateChangedListener((evt) => {
        if (cancelled) return;
        setConnectionState(evt.state);
        if (evt.state === 'connected' && !evt.error) {
          rejoinAttempts = 0;
          scheduleTokenRefresh();
          return;
        }
        if (evt.state === 'disconnected' && connectedRef.current) {
          connectedRef.current = false;
          setPhase('connecting');
          void attemptRejoin('connection_disconnected');
          return;
        }
        if (evt.state === 'connected' && evt.error) {
          void attemptRejoin(`connection_error_${evt.error}`);
        }
      });

      errSub = addOnStageErrorListener((evt) => {
        if (cancelled) return;
        if (!evt.isFatal) return;
        if (connectedRef.current) {
          void attemptRejoin(evt.description || `stage_error_${evt.code}`);
        } else {
          fail(evt.description || `stage_error_${evt.code}`);
        }
      });

      try {
        await ensureStageSdkInitialized();
        if (cancelled) return;

        const token = await resolveViewerStageToken(args.roomId, args.accessToken!);
        if (!token) {
          fail('token_missing');
          return;
        }
        if (cancelled) return;

        await joinStage(token);
        if (cancelled) {
          await leaveStage().catch(() => {
            /* ignore */
          });
          return;
        }

        connectTimeoutId = setTimeout(() => {
          if (!connectedRef.current) void attemptRejoin('connect_timeout');
        }, CONNECT_TIMEOUT_MS);
      } catch (err) {
        if (connectedRef.current) {
          void attemptRejoin(err instanceof Error ? err.message : 'subscribe_throw');
        } else {
          fail(err instanceof Error ? err.message : 'subscribe_throw');
        }
      }
    };

    void joinOnce();

    return () => {
      cancelled = true;
      rejoinRef.current = () => {};
      clearTimers();
      teardownListeners();
      connectedRef.current = false;
      setPhase('idle');
      setConnectionState('disconnected');
      void leaveStage().catch(() => {
        /* ignore */
      });
    };
  }, [args.active, args.accessToken, args.roomId, args.refreshNonce, args.subscribeEpoch]);

  return { phase, connectionState, remoteVideo };
}
