import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addOnStageConnectionStateChangedListener,
  addOnStageErrorListener,
  joinStage,
  leaveStage,
  useStageParticipants,
} from 'expo-realtime-ivs-broadcast';
import { fetchViewerStageToken } from '../api/liveRoomStreamRepository';
import { ensureStageSdkInitialized } from '../lib/stageSdk';

/** If no remote media arrives within this window, fail over to HLS. */
const CONNECT_TIMEOUT_MS = 7_000;
/** When signed out, do not block on WebRTC forever — fail over to HLS for guests. */
const AUTH_WAIT_MS = 1_500;

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
  onConnected: () => void;
  onFailed: (reason: string) => void;
  onDisconnected: () => void;
}) {
  const [phase, setPhase] = useState<MobileStageSubscribePhase>('idle');
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>(
    'disconnected',
  );
  const connectedRef = useRef(false);
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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    connectedRef.current = false;

    const fail = (reason: string) => {
      if (cancelled || connectedRef.current) return;
      setPhase('failed');
      setConnectionState('disconnected');
      void leaveStage().catch(() => {
        /* ignore */
      });
      cbRef.current.onFailed(reason);
    };

    if (!args.accessToken?.trim()) {
      setPhase('idle');
      timeoutId = setTimeout(() => fail('auth_required'), AUTH_WAIT_MS);
      return () => {
        cancelled = true;
        if (timeoutId != null) clearTimeout(timeoutId);
      };
    }

    setPhase('connecting');
    setConnectionState('connecting');

    const connSub = addOnStageConnectionStateChangedListener((evt) => {
      if (cancelled) return;
      setConnectionState(evt.state);
      if (evt.state === 'disconnected') {
        connectedRef.current = false;
        setPhase('idle');
        cbRef.current.onDisconnected();
      }
      if (evt.state === 'connected' && evt.error) {
        fail(evt.error);
      }
    });

    const errSub = addOnStageErrorListener((evt) => {
      if (cancelled || !evt.isFatal) return;
      fail(evt.description || `stage_error_${evt.code}`);
    });

    void (async () => {
      try {
        await ensureStageSdkInitialized();
        if (cancelled) return;

        const tokenPayload = await fetchViewerStageToken(args.roomId, args.accessToken!);
        if (!tokenPayload?.token) {
          fail('token_missing');
          return;
        }
        if (cancelled) return;

        await joinStage(tokenPayload.token);
        if (cancelled) {
          await leaveStage().catch(() => {
            /* ignore */
          });
          return;
        }

        timeoutId = setTimeout(() => {
          if (!connectedRef.current) fail('connect_timeout');
        }, CONNECT_TIMEOUT_MS);
      } catch (err) {
        fail(err instanceof Error ? err.message : 'subscribe_throw');
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
      connSub.remove();
      errSub.remove();
      connectedRef.current = false;
      setPhase('idle');
      setConnectionState('disconnected');
      void leaveStage().catch(() => {
        /* ignore */
      });
    };
  }, [args.active, args.accessToken, args.roomId, args.refreshNonce]);

  return { phase, connectionState, remoteVideo };
}
