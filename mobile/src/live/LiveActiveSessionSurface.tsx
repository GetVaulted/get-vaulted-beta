import { useVideoPlayer, VideoView, isPictureInPictureSupported } from 'expo-video';
import { setStageAudioOutputEnabled } from 'expo-realtime-ivs-broadcast';
import { useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus, StyleSheet, useWindowDimensions, View } from 'react-native';
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
 *
 * Critical: the native Stage view keeps a stable full-window layout size.
 * Mini is clip + transform only — resizing the IVS surface blanks video on iOS.
 */
export function LiveActiveSessionSurface() {
  const { mode, session, paused, miniPos } = useLiveActiveSession();
  const { width: winW, height: winH } = useWindowDimensions();
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
      // Never re-enable on cleanup — that leaked audio after mini X close.
      void setStageAudioOutputEnabled(false).catch(() => {
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

  const miniScale = useMemo(() => {
    if (winW <= 0 || winH <= 0) return 1;
    // Cover the mini rect (crop overflow) — same idea as contentFit cover.
    return Math.max(LIVE_MINI_PLAYER_W / winW, LIVE_MINI_PLAYER_H / winH);
  }, [winW, winH]);

  const outerStyle = useMemo(() => {
    if (mode === 'mini') {
      return {
        position: 'absolute' as const,
        left: miniPos.x,
        top: miniPos.y,
        width: LIVE_MINI_PLAYER_W,
        height: LIVE_MINI_PLAYER_H,
        zIndex: 60,
        elevation: 60,
        overflow: 'hidden' as const,
        borderRadius: 14,
        backgroundColor: '#050505',
        opacity: paused ? 0 : 1,
      };
    }
    // Full-bleed under the transparent live navigator stack (Whatnot-style).
    return {
      ...StyleSheet.absoluteFillObject,
      zIndex: 0,
      elevation: 0,
    };
  }, [mode, miniPos.x, miniPos.y, paused]);

  // Inner stage stays full-window sized forever — only transform changes for mini.
  const innerStyle = useMemo(() => {
    if (mode !== 'mini') {
      return StyleSheet.absoluteFillObject;
    }
    return {
      position: 'absolute' as const,
      width: winW,
      height: winH,
      // RN scales from center; shift so the scaled frame fills the mini clip.
      transform: [
        { translateX: (LIVE_MINI_PLAYER_W - winW) / 2 },
        { translateY: (LIVE_MINI_PLAYER_H - winH) / 2 },
        { scale: miniScale },
      ],
    };
  }, [mode, winW, winH, miniScale]);

  if (!active || !session) return null;

  // Keep Stage joined across mini pause — active=false leaveStages the process singleton.
  const stageSubscribeActive = session.transport === 'webrtc';

  return (
    <View pointerEvents="none" style={outerStyle} collapsable={false}>
      <View style={innerStyle} collapsable={false}>
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
    </View>
  );
}
