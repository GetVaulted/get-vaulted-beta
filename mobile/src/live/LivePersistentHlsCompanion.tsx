import { VideoView, isPictureInPictureSupported } from 'expo-video';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, StyleSheet, View, type AppStateStatus } from 'react-native';
import { useHlsLiveEdgeSeek } from '../hooks/useHlsLiveEdgeSeek';
import {
  isLivePictureInPictureAppState,
  LIVE_PIP_RETRY_DELAYS_MS,
  shouldAttemptLivePictureInPicture,
  shouldPrepareLivePictureInPicture,
} from '../lib/livePlaybackAppState';
import { useLiveMiniPlayer } from './LiveMiniPlayerContext';

/**
 * Tiny root HLS surface for the shared player while a live room is open.
 * Keeps the native decoder attached without covering the UI (full-screen 8% wash was wrong).
 * In-room home-swipe PiP still uses LiveStagePlayback's companion; this exists so Back → mini
 * re-homes an already-playing player instead of cold-starting.
 */
export function LivePersistentHlsCompanion() {
  const { session, player, playbackSourceUrl, paused } = useLiveMiniPlayer();
  const videoRef = useRef<VideoView>(null);
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pipRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const preparePipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only mount while warming in-room (mini overlay owns the VideoView after Back).
  const active = Boolean(playbackSourceUrl) && !session;
  useHlsLiveEdgeSeek(player, active);

  const clearPipRetries = useCallback(() => {
    for (const t of pipRetryTimersRef.current) clearTimeout(t);
    pipRetryTimersRef.current = [];
    if (preparePipTimerRef.current) {
      clearTimeout(preparePipTimerRef.current);
      preparePipTimerRef.current = null;
    }
  }, []);

  const attemptPictureInPicture = useCallback(() => {
    // Prefer LiveStagePlayback's larger companion while in-room; this is a fallback if that view is gone.
    if (!active || paused) return;
    if (!isPictureInPictureSupported()) return;
    clearPipRetries();
    try {
      player.muted = false;
      player.volume = 1;
      player.play();
      player.targetOffsetFromLive = 0.35;
    } catch {
      /* ignore */
    }
    for (const delayMs of LIVE_PIP_RETRY_DELAYS_MS) {
      const timer = setTimeout(() => {
        if (!isLivePictureInPictureAppState(prevAppStateRef.current)) return;
        const view = videoRef.current;
        if (!view) return;
        void view.startPictureInPicture().catch(() => {
          /* unsupported / already active */
        });
      }, delayMs);
      pipRetryTimersRef.current.push(timer);
    }
  }, [active, clearPipRetries, paused, player]);

  useEffect(() => {
    if (!active) {
      clearPipRetries();
      return;
    }
    const sub = AppState.addEventListener('change', (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;

      if (shouldPrepareLivePictureInPicture(next, prev)) {
        if (preparePipTimerRef.current) clearTimeout(preparePipTimerRef.current);
        preparePipTimerRef.current = setTimeout(() => {
          preparePipTimerRef.current = null;
          if (prevAppStateRef.current === 'active') return;
          attemptPictureInPicture();
        }, 40);
        return;
      }

      if (shouldAttemptLivePictureInPicture(next, prev)) {
        attemptPictureInPicture();
        return;
      }

      if (next === 'active') {
        clearPipRetries();
        try {
          player.muted = true;
          player.volume = 0;
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      clearPipRetries();
      sub.remove();
    };
  }, [active, attemptPictureInPicture, clearPipRetries, player]);

  if (!active || !playbackSourceUrl) return null;

  return (
    <View pointerEvents="none" style={styles.host} collapsable={false}>
      <VideoView
        ref={videoRef}
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        collapsable={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    // Keep a real frame buffer off-screen (3×3 is too small for a reliable handoff / PiP).
    left: -160,
    top: 0,
    width: 132,
    height: 220,
    opacity: 0.08,
    zIndex: 0,
    overflow: 'hidden',
  },
  video: {
    width: 132,
    height: 220,
  },
});
