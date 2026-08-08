import { useVideoPlayer, VideoView, isPictureInPictureSupported } from 'expo-video';
import { useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus, StyleSheet, View } from 'react-native';
import { StageSubscriberVideo } from '../components/live/StageSubscriberVideo';
import { useHlsLiveEdgeSeek } from '../hooks/useHlsLiveEdgeSeek';
import { useStageRemotePictureInPicture } from '../hooks/useStageRemotePictureInPicture';
import {
  isLivePictureInPictureAppState,
  LIVE_PIP_RETRY_DELAYS_MS,
  shouldAttemptLivePictureInPicture,
  shouldPrepareLivePictureInPicture,
} from '../lib/livePlaybackAppState';
import { isLivePlaybackCommerceHoldActive } from '../lib/livePlaybackCommerceHold';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';
import {
  LIVE_MINI_PLAYER_H,
  LIVE_MINI_PLAYER_W,
  useLiveActiveSession,
} from './LiveActiveSessionContext';

const LIVE_PICTURE_IN_PICTURE_ENABLED = true;

/**
 * Single live playback surface for the active room.
 * Back only changes layout (full-bleed ↔ mini float) — Stage subscribe stays joined.
 * OS home-swipe PiP targets this view (Stage remote PiP / HLS VideoView), not a room-local one.
 */
export function LiveActiveSessionSurface() {
  const { mode, session, paused, miniPos } = useLiveActiveSession();
  const videoRef = useRef<VideoView>(null);
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pipRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const active = mode === 'room' || mode === 'mini';
  const hlsUrl = session?.transport === 'hls' ? session.playbackUrl?.trim() || null : null;
  const hlsPipEnabled =
    LIVE_PICTURE_IN_PICTURE_ENABLED &&
    active &&
    mode === 'room' &&
    session?.transport === 'hls' &&
    Boolean(hlsUrl) &&
    !paused;

  // Native Stage remote PiP — same subscribe as the pixels on this surface.
  useStageRemotePictureInPicture({
    enabled:
      LIVE_PICTURE_IN_PICTURE_ENABLED &&
      mode === 'room' &&
      session?.transport === 'webrtc' &&
      !paused &&
      !session?.hostPaused,
    roomId: session?.roomId ?? '',
  });

  const player = useVideoPlayer(hlsUrl, (p) => {
    p.loop = false;
    p.muted = true;
    p.volume = 1;
    p.audioMixingMode = 'mixWithOthers';
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = false;
    try {
      p.targetOffsetFromLive = 0.35;
    } catch {
      /* ignore */
    }
  });

  useHlsLiveEdgeSeek(player, Boolean(active && hlsUrl && !paused));

  useEffect(() => {
    if (!hlsUrl || !active) return;
    try {
      if (paused) {
        player.pause();
        return;
      }
      const muteInRoom = mode === 'room' && Boolean(session?.muted);
      player.muted = muteInRoom;
      player.volume = muteInRoom ? 0 : 1;
      player.audioMixingMode = mode === 'mini' ? 'doNotMix' : 'mixWithOthers';
      player.showNowPlayingNotification = mode === 'mini';
      player.staysActiveInBackground = LIVE_PICTURE_IN_PICTURE_ENABLED;
      player.play();
    } catch {
      /* ignore */
    }
  }, [hlsUrl, active, paused, mode, player, session?.muted]);

  // Home-swipe PiP for HLS-only rooms — must use this root VideoView (room-local is skipped).
  useEffect(() => {
    if (!hlsPipEnabled) {
      for (const t of pipRetryTimersRef.current) clearTimeout(t);
      pipRetryTimersRef.current = [];
      return undefined;
    }

    const clearPipRetries = () => {
      for (const t of pipRetryTimersRef.current) clearTimeout(t);
      pipRetryTimersRef.current = [];
    };

    const attemptHlsPictureInPicture = () => {
      if (isLivePlaybackCommerceHoldActive()) return;
      if (!isPictureInPictureSupported()) {
        viewerLifecycleLog('root_hls_pip_unsupported', { roomId: session?.roomId });
        return;
      }
      clearPipRetries();
      try {
        player.play();
      } catch {
        /* ignore */
      }
      for (const delayMs of LIVE_PIP_RETRY_DELAYS_MS) {
        const timer = setTimeout(() => {
          if (!isLivePictureInPictureAppState(prevAppStateRef.current)) return;
          if (isLivePlaybackCommerceHoldActive()) return;
          const view = videoRef.current;
          if (!view) return;
          void view
            .startPictureInPicture()
            .then(() => {
              viewerLifecycleLog('root_hls_pip_started', {
                roomId: session?.roomId,
                delayMs,
              });
              clearPipRetries();
            })
            .catch(() => {
              /* retry later */
            });
        }, delayMs);
        pipRetryTimersRef.current.push(timer);
      }
    };

    const sub = AppState.addEventListener('change', (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;
      if (shouldPrepareLivePictureInPicture(next, prev)) {
        attemptHlsPictureInPicture();
        return;
      }
      if (shouldAttemptLivePictureInPicture(next, prev)) {
        attemptHlsPictureInPicture();
      }
    });

    return () => {
      clearPipRetries();
      sub.remove();
    };
  }, [hlsPipEnabled, player, session?.roomId]);

  const layoutStyle = useMemo(() => {
    if (mode === 'mini') {
      return {
        position: 'absolute' as const,
        left: miniPos.x,
        top: miniPos.y,
        width: LIVE_MINI_PLAYER_W,
        height: LIVE_MINI_PLAYER_H,
        zIndex: 40,
        elevation: 40,
        overflow: 'hidden' as const,
        borderRadius: 14,
        backgroundColor: '#050505',
      };
    }
    return {
      ...StyleSheet.absoluteFillObject,
      zIndex: 0,
      elevation: 0,
    };
  }, [mode, miniPos.x, miniPos.y]);

  if (!active || !session) return null;

  // Stage stays joined for room + mini. Never leave on Back.
  // Mini pause must not set active=false — that calls leaveStage.
  const stageSubscribeActive = session.transport === 'webrtc' && active;

  return (
    <View pointerEvents="none" style={layoutStyle} collapsable={false}>
      {session.transport === 'webrtc' ? (
        <StageSubscriberVideo
          roomId={session.roomId}
          accessToken={session.accessToken}
          active={stageSubscribeActive}
          hostPaused={Boolean(session.hostPaused)}
          latchRejoinOnLeave={false}
          subscribeEpoch={session.subscribeEpoch}
          foregroundResumeNonce={session.foregroundResumeNonce ?? 0}
          contentFit={session.contentFit ?? 'cover'}
          onConnected={() => session.onConnected?.()}
          onFailed={(reason) => session.onFailed?.(reason)}
          onDisconnected={() => session.onDisconnected?.()}
        />
      ) : null}
      {session.transport === 'hls' && hlsUrl ? (
        <VideoView
          ref={videoRef}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={session.contentFit ?? 'contain'}
          nativeControls={false}
          allowsPictureInPicture={LIVE_PICTURE_IN_PICTURE_ENABLED && mode === 'room'}
          startsPictureInPictureAutomatically={
            LIVE_PICTURE_IN_PICTURE_ENABLED && mode === 'room'
          }
          collapsable={false}
        />
      ) : null}
    </View>
  );
}
