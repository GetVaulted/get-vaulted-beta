import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { VideoView, isPictureInPictureSupported } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveRoomText } from '../components/live/LiveRoomText';
import { useHlsLiveEdgeSeek } from '../hooks/useHlsLiveEdgeSeek';
import {
  getBuyerLiveStreamCached,
  invalidateBuyerLiveStreamCache,
} from '../lib/liveStreamPrefetchCache';
import { shouldAttachHlsPlayback } from '../lib/liveStreamPlayback';
import {
  isLivePictureInPictureAppState,
  shouldAttemptLivePictureInPicture,
  shouldPrepareLivePictureInPicture,
} from '../lib/livePlaybackAppState';
import { rootNavigationRef } from '../navigation/rootNavigationRef';
import { radii } from '../theme';
import { useLiveMiniPlayer } from './LiveMiniPlayerContext';

const PLAYER_W = 132;
const PLAYER_H = 220;
const EDGE_PAD = 10;

/**
 * Whatnot / TikTok-style in-app floating live player.
 * Video comes from the shared root player (warmed in-room) — this shell only re-homes the VideoView.
 */
export function LiveMiniPlayerOverlay() {
  const {
    session,
    paused,
    close,
    togglePaused,
    player,
    playbackSourceUrl,
    warmHls,
    kickLivePlayback,
    isMiniSessionActive,
  } = useLiveMiniPlayer();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playbackStalled, setPlaybackStalled] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<VideoView>(null);
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pipRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const preparePipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoverInflightRef = useRef(false);
  const lastKickAtRef = useRef(0);

  const bounds = useMemo(() => {
    const maxX = Math.max(EDGE_PAD, winW - PLAYER_W - EDGE_PAD);
    const maxY = Math.max(EDGE_PAD, winH - PLAYER_H - insets.bottom - EDGE_PAD);
    const minY = insets.top + 8;
    return { maxX, maxY, minY };
  }, [winW, winH, insets.bottom, insets.top]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const [pos, setPos] = useState({ x: bounds.maxX, y: Math.max(bounds.minY, 72) });
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPos((p) => ({
      x: Math.min(bounds.maxX, Math.max(EDGE_PAD, p.x)),
      y: Math.min(bounds.maxY, Math.max(bounds.minY, p.y)),
    }));
  }, [bounds.maxX, bounds.maxY, bounds.minY]);

  const recoverLiveMirror = useCallback(
    async (opts?: { forceKick?: boolean }) => {
      if (!session || recoverInflightRef.current) return;
      const roomId = session.roomId;
      recoverInflightRef.current = true;
      try {
        // Heal Stage→HLS composition; kick only when forced or URL was missing.
        invalidateBuyerLiveStreamCache(roomId);
        const stream = await getBuyerLiveStreamCached(roomId, session.accessToken, {
          healComposition: true,
        });
        if (!isMiniSessionActive(roomId)) return;
        if (!stream) return;
        const url = stream.playbackUrl?.trim() || null;
        if (url && shouldAttachHlsPlayback(stream.streamHealth, url)) {
          warmHls(roomId, url);
          if (opts?.forceKick) {
            lastKickAtRef.current = Date.now();
            kickLivePlayback(url);
          }
          return;
        }
        if (opts?.forceKick && playbackSourceUrl && isMiniSessionActive(roomId)) {
          lastKickAtRef.current = Date.now();
          kickLivePlayback(playbackSourceUrl);
        }
      } finally {
        recoverInflightRef.current = false;
      }
    },
    [session, warmHls, kickLivePlayback, playbackSourceUrl, isMiniSessionActive],
  );
  const recoverLiveMirrorRef = useRef(recoverLiveMirror);
  recoverLiveMirrorRef.current = recoverLiveMirror;

  // On minimize: heal composition in background. Do NOT immediately replace — minimize already
  // scheduled one delayed kick. Extra replace storms crash expo-video on Back→float.
  useEffect(() => {
    if (!session?.roomId) {
      setPlaybackStalled(false);
      lastKickAtRef.current = 0;
      return;
    }
    void recoverLiveMirrorRef.current({ forceKick: !playbackSourceUrl });
    // One soft retry if composition was cold — still no kick storm.
    const retry = setTimeout(() => {
      void recoverLiveMirrorRef.current({ forceKick: false });
    }, 12_000);
    return () => clearTimeout(retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mini room
  }, [session?.roomId]);

  useHlsLiveEdgeSeek(player, Boolean(session && playbackSourceUrl && !paused));

  // Stall watchdog: prefer play()/seek over replace. Kick only after a long freeze.
  useEffect(() => {
    if (!session || paused || !playbackSourceUrl) return undefined;
    let lastTime = -1;
    let stuckTicks = 0;
    const id = setInterval(() => {
      try {
        if (!isMiniSessionActive(session.roomId)) return;
        const t = player.currentTime;
        const playing = player.playing;
        if (!playing) {
          player.muted = false;
          player.volume = 1;
          player.play();
          stuckTicks += 1;
        } else if (Number.isFinite(t) && Math.abs(t - lastTime) < 0.05) {
          stuckTicks += 1;
        } else {
          stuckTicks = 0;
          setPlaybackStalled(false);
        }
        if (Number.isFinite(t)) lastTime = t;
        // ~4s stuck → soft seek; ~8s → one coalesced kick + heal
        if (stuckTicks === 8) {
          setPlaybackStalled(true);
          try {
            player.targetOffsetFromLive = 0.35;
            const duration = player.duration;
            if (Number.isFinite(duration) && duration > 0 && duration < 1e7) {
              player.currentTime = Math.max(0, duration - 0.35);
            }
            player.play();
          } catch {
            /* ignore */
          }
        }
        if (stuckTicks >= 16) {
          stuckTicks = 0;
          setPlaybackStalled(true);
          if (Date.now() - lastKickAtRef.current < 10_000) return;
          lastKickAtRef.current = Date.now();
          kickLivePlayback(playbackSourceUrl);
          void recoverLiveMirrorRef.current({ forceKick: false });
        }
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearInterval(id);
  }, [session, playbackSourceUrl, paused, player, kickLivePlayback, isMiniSessionActive]);

  const clearPipRetries = useCallback(() => {
    for (const t of pipRetryTimersRef.current) clearTimeout(t);
    pipRetryTimersRef.current = [];
    if (preparePipTimerRef.current) {
      clearTimeout(preparePipTimerRef.current);
      preparePipTimerRef.current = null;
    }
  }, []);

  const attemptPictureInPicture = useCallback(() => {
    if (!session || paused) return;
    if (!isPictureInPictureSupported()) return;
    clearPipRetries();
    try {
      player.play();
      player.muted = false;
      player.volume = 1;
      player.targetOffsetFromLive = 0.35;
    } catch {
      /* ignore */
    }
    // Short retry window — long storms fight Stage PiP and feel janky on home swipe.
    for (const delayMs of [0, 200, 600] as const) {
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
  }, [clearPipRetries, paused, player, session]);

  useEffect(() => {
    if (!session || !playbackSourceUrl) return;
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
      }
    });
    return () => {
      clearPipRetries();
      sub.remove();
    };
  }, [session, playbackSourceUrl, attemptPictureInPicture, clearPipRetries]);

  const showControlsBriefly = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3200);
  }, []);

  useEffect(() => {
    if (!session) return;
    showControlsBriefly();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [session, showControlsBriefly]);

  const expandToLiveRoom = useCallback(() => {
    if (!session) return;
    const roomId = session.roomId;
    // Navigate first — LiveRoom soft-hands off the mini. Closing first forced a cold reload.
    if (!rootNavigationRef.isReady()) return;
    rootNavigationRef.navigate('MainTabs', {
      screen: 'Live',
      params: {
        screen: 'LiveRoom',
        params: { streamId: roomId },
      },
    });
  }, [session]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          dragOrigin.current = { ...posRef.current };
          showControlsBriefly();
        },
        onPanResponderMove: (_e, g) => {
          const b = boundsRef.current;
          setPos({
            x: Math.min(b.maxX, Math.max(EDGE_PAD, dragOrigin.current.x + g.dx)),
            y: Math.min(b.maxY, Math.max(b.minY, dragOrigin.current.y + g.dy)),
          });
        },
        onPanResponderRelease: () => {
          const b = boundsRef.current;
          setPos((p) => ({
            x: p.x + PLAYER_W / 2 < winW / 2 ? EDGE_PAD : b.maxX,
            y: p.y,
          }));
        },
      }),
    [showControlsBriefly, winW],
  );

  if (!session) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} collapsable={false}>
      <View
        style={[styles.shell, { left: pos.x, top: pos.y, width: PLAYER_W, height: PLAYER_H }]}
        {...panResponder.panHandlers}
        collapsable={false}
      >
        <Pressable style={styles.surface} onPress={showControlsBriefly}>
          {playbackSourceUrl ? (
            <VideoView
              ref={videoRef}
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
              allowsPictureInPicture
              startsPictureInPictureAutomatically
              collapsable={false}
            />
          ) : session.thumbnailUrl ? (
            <Image
              source={{ uri: session.thumbnailUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.fallback]} />
          )}

          {!controlsVisible ? (
            <View style={styles.livePill} pointerEvents="none">
              <View style={[styles.liveDot, playbackStalled ? styles.liveDotWarn : null]} />
              <LiveRoomText style={styles.liveTxt}>
                {playbackStalled ? 'SYNC' : 'LIVE'}
              </LiveRoomText>
            </View>
          ) : null}

          {controlsVisible ? (
            <View style={styles.controls} pointerEvents="box-none">
              <Pressable
                style={[styles.ctrlBtn, styles.ctrlBtnCorner, styles.ctrlClose]}
                onPress={close}
                hitSlop={8}
                accessibilityLabel="Close mini player"
              >
                <Ionicons name="close" size={15} color="#fff" />
              </Pressable>
              <Pressable
                style={[styles.ctrlBtn, styles.ctrlBtnCorner, styles.ctrlExpand]}
                onPress={expandToLiveRoom}
                hitSlop={8}
                accessibilityLabel="Expand live room"
              >
                <Ionicons name="expand" size={14} color="#fff" />
              </Pressable>
              <Pressable
                style={[styles.ctrlBtn, styles.ctrlBtnCenter]}
                onPress={togglePaused}
                hitSlop={8}
                accessibilityLabel={paused ? 'Play' : 'Pause'}
              >
                <Ionicons name={paused ? 'play' : 'pause'} size={20} color="#111" />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.caption} pointerEvents="none">
            <LiveRoomText style={styles.title} numberOfLines={1}>
              {session.title}
            </LiveRoomText>
            {session.hostLabel ? (
              <LiveRoomText style={styles.host} numberOfLines={1}>
                {session.hostLabel}
              </LiveRoomText>
            ) : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 24,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  surface: {
    flex: 1,
  },
  fallback: {
    backgroundColor: '#111',
  },
  livePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveDotWarn: {
    backgroundColor: '#f59e0b',
  },
  liveTxt: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: '#fff',
  },
  controls: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  ctrlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  ctrlBtnCorner: {
    position: 'absolute',
    top: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  ctrlClose: {
    left: 6,
  },
  ctrlExpand: {
    right: 6,
  },
  ctrlBtnCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -22,
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(255,255,255,0.9)',
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  host: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
  },
});
