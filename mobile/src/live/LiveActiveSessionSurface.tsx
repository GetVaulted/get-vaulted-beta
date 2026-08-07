import { useVideoPlayer, VideoView, isPictureInPictureSupported } from 'expo-video';
import { setStageAudioOutputEnabled } from 'expo-realtime-ivs-broadcast';
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
 * Whatnot-style single live surface: one Stage/HLS join for the session.
 * Back only changes layout (full-bleed ↔ mini float) — never leaveStage.
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

  useStageRemotePictureInPicture({
    enabled:
      LIVE_PICTURE_IN_PICTURE_ENABLED &&
      active &&
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

  // Mini pause: mute Stage audio without leaveStage (Whatnot keeps the subscribe).
  useEffect(() => {
    if (!active || session?.transport !== 'webrtc') return;
    void setStageAudioOutputEnabled(!paused).catch(() => {
      /* ignore */
    });
    return () => {
      void setStageAudioOutputEnabled(true).catch(() => {
        /* ignore */
      });
    };
  }, [active, paused, session?.transport]);

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
    // Full-bleed under the transparent live navigator stack (Whatnot-style).
    return {
      ...StyleSheet.absoluteFillObject,
      zIndex: 0,
      elevation: 0,
    };
  }, [mode, miniPos.x, miniPos.y]);

  if (!active || !session) return null;

  // Keep Stage joined across mini pause — active=false leaveStages the process singleton.
  const stageSubscribeActive = session.transport === 'webrtc';

  return (
    <View
      pointerEvents="none"
      style={[layoutStyle, mode === 'mini' && paused ? { opacity: 0 } : null]}
      collapsable={false}
    >
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
