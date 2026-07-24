import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addOnStageConnectionStateChangedListener,
  addOnStageErrorListener,
  joinStage,
  leaveStage,
  useStageParticipants,
} from 'expo-realtime-ivs-broadcast';
import { joinStageSerialized, leaveStageSerialized } from '../lib/ivsStageGate';
import { markBuyerStageSubscribeTornDown } from '../lib/liveStreamPlayback';
import { invalidateViewerStageToken, resolveViewerStageToken } from '../lib/liveStreamPrefetchCache';
import { ensureStageSdkInitialized } from '../lib/stageSdk';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';

/** If no remote media arrives within this window, retry before failing over to HLS. */
const CONNECT_TIMEOUT_MS = 12_000;
/** When signed out, do not block on WebRTC forever — fail over to HLS for guests. */
const AUTH_WAIT_MS = 1_500;
/** Max automatic rejoin attempts inside the hook before reporting failure upstream. */
const MAX_REJOIN_ATTEMPTS = 12;
/** Proactive token refresh before the 20-minute viewer TTL expires. */
const TOKEN_REFRESH_MS = 17 * 60 * 1000;
/** Remote video missing this long while still "connected" triggers a rejoin. */
const REMOTE_VIDEO_LOST_MS = 12_000;
const REMOTE_VIDEO_CHECK_MS = 2_000;

export type MobileStageRemoteTarget = {
  participantId: string;
  deviceUrn: string;
} | null;

export type MobileStageSubscribePhase = 'idle' | 'connecting' | 'connected' | 'failed';

async function teardownBuyerStage(
  reason: string,
  opts?: { /** True only for committed home/background leave — never for feed swipe. */ latchRejoin?: boolean },
): Promise<void> {
  if (opts?.latchRejoin) {
    markBuyerStageSubscribeTornDown();
  }
  viewerLifecycleLog('stage_teardown', { reason, latchRejoin: Boolean(opts?.latchRejoin) });
  await leaveStageSerialized(() => leaveStage());
  viewerLifecycleLog('cleanup_completed', { reason });
}

/**
 * Buyer-side native IVS Real-Time Stage subscriber.
 *
 * On leave (`active=false` / unmount): always `leaveStage` so the process-wide Stage singleton is
 * free for the next show. Only latch “never rejoin WebRTC” when `latchRejoinOnLeave` is set
 * (committed background suspend) — feed swipe must stay able to hybrid-upgrade the next room.
 */
export function useMobileStageSubscribe(args: {
  roomId: string;
  accessToken?: string;
  active: boolean;
  /**
   * Host Pause / leave-app keep-alive: stay joined while remote video is intentionally gone.
   * Skips remote_video_lost rejoin (which would leaveStage + poison the process latch).
   */
  hostPaused?: boolean;
  /**
   * When true, tearing down this subscribe marks the process-wide WebRTC rejoin latch.
   * Use only for committed AppState background suspend — not show→show pager leaves.
   */
  latchRejoinOnLeave?: boolean;
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
  const hasJoinedStageRef = useRef(false);
  const rejoinRef = useRef<(trigger: string) => void>(() => {});
  const cbRef = useRef(args);
  cbRef.current = args;
  const { participants } = useStageParticipants();

  const remoteVideo = useMemo((): MobileStageRemoteTarget => {
    if (connectionState !== 'connected') return null;
    for (const participant of participants) {
      const video = participant.streams.find((s) => s.mediaType === 'video');
      if (video) {
        return { participantId: participant.id, deviceUrn: video.deviceUrn };
      }
    }
    return null;
  }, [participants, connectionState]);

  // Trace what the Stage SDK reports about remote media — used to tell "participant joined but no
  // video stream" apart from "video stream present but native surface never painted".
  useEffect(() => {
    if (!args.active) return;
    let videoStreams = 0;
    let audioStreams = 0;
    for (const p of participants) {
      for (const s of p.streams) {
        if (s.mediaType === 'video') videoStreams += 1;
        else if (s.mediaType === 'audio') audioStreams += 1;
      }
    }
    viewerLifecycleLog('stage_participants_changed', {
      roomId: args.roomId,
      participantCount: participants.length,
      videoStreamPresent: videoStreams > 0,
      audioStreamPresent: audioStreams > 0,
      remoteVideoPresent: Boolean(remoteVideo),
      connectionState,
    });
  }, [participants, remoteVideo, connectionState, args.active, args.roomId]);

  useEffect(() => {
    if (!remoteVideo || connectedRef.current || connectionState !== 'connected') return;
    connectedRef.current = true;
    setPhase('connected');
    viewerLifecycleLog('subscription_connected', {
      roomId: args.roomId,
      participantId: remoteVideo.participantId,
    });
    cbRef.current.onConnected();
  }, [remoteVideo, connectionState, args.roomId]);

  useEffect(() => {
    if (!args.active || !connectedRef.current) return undefined;
    if (args.hostPaused) return undefined;
    let lostSince: number | null = remoteVideo ? null : Date.now();
    const id = setInterval(() => {
      if (!connectedRef.current) return;
      if (cbRef.current.hostPaused) {
        lostSince = null;
        return;
      }
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
  }, [remoteVideo, args.active, args.hostPaused]);

  useEffect(() => {
    if (!args.active) {
      viewerLifecycleLog('screen_blurred_or_inactive', { roomId: args.roomId });
      const hadJoin = hasJoinedStageRef.current;
      connectedRef.current = false;
      hasJoinedStageRef.current = false;
      setPhase('idle');
      setConnectionState('disconnected');
      if (hadJoin) {
        void teardownBuyerStage('active_false', {
          latchRejoin: Boolean(cbRef.current.latchRejoinOnLeave),
        });
      }
      return;
    }

    viewerLifecycleLog('viewer_initialization_started', {
      roomId: args.roomId,
      subscribeEpoch: args.subscribeEpoch ?? 0,
      refreshNonce: args.refreshNonce ?? 0,
    });

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
      hasJoinedStageRef.current = false;
      setPhase('failed');
      setConnectionState('disconnected');
      viewerLifecycleLog('player_error', { roomId: args.roomId, reason });
      void teardownBuyerStage(`fail_${reason}`, {
        latchRejoin: Boolean(cbRef.current.latchRejoinOnLeave),
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
      hasJoinedStageRef.current = false;
      setPhase('connecting');
      setConnectionState('connecting');
      clearTimers();
      teardownListeners();
      try {
        await teardownBuyerStage(`rejoin_${trigger}`, { latchRejoin: false });
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
        viewerLifecycleLog('player_state_changed', { roomId: args.roomId, state: evt.state });
        if (evt.state === 'connected' && !evt.error) {
          rejoinAttempts = 0;
          scheduleTokenRefresh();
          return;
        }
        if (evt.state === 'disconnected' && connectedRef.current) {
          connectedRef.current = false;
          hasJoinedStageRef.current = false;
          setPhase('connecting');
          cbRef.current.onDisconnected();
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
        viewerLifecycleLog('player_error', {
          roomId: args.roomId,
          code: evt.code,
          description: evt.description,
        });
        if (connectedRef.current) {
          void attemptRejoin(evt.description || `stage_error_${evt.code}`);
        } else {
          fail(evt.description || `stage_error_${evt.code}`);
        }
      });

      try {
        await ensureStageSdkInitialized('subscribeOnly');
        if (cancelled) return;

        const token = await resolveViewerStageToken(args.roomId, args.accessToken!);
        if (!token) {
          fail('token_missing');
          return;
        }
        if (cancelled) return;

        viewerLifecycleLog('player_created', { roomId: args.roomId, transport: 'webrtc' });
        viewerLifecycleLog('stage_join_serialized_start', {
          roomId: args.roomId,
          subscribeEpoch: args.subscribeEpoch ?? 0,
        });
        await joinStageSerialized(joinStage, token);
        viewerLifecycleLog('stage_join_serialized_end', { roomId: args.roomId });
        hasJoinedStageRef.current = true;
        if (cancelled) {
          await teardownBuyerStage('cancelled_after_join', {
            latchRejoin: Boolean(cbRef.current.latchRejoinOnLeave),
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
      const hadJoin = hasJoinedStageRef.current;
      connectedRef.current = false;
      hasJoinedStageRef.current = false;
      setPhase('idle');
      setConnectionState('disconnected');
      if (hadJoin) {
        void teardownBuyerStage('effect_cleanup', {
          latchRejoin: Boolean(cbRef.current.latchRejoinOnLeave),
        });
      }
    };
  }, [args.active, args.accessToken, args.roomId, args.subscribeEpoch]);

  return { phase, connectionState, remoteVideo };
}
