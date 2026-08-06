import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiveRoomText } from '../components/live/LiveRoomText';
import { rootNavigationRef } from '../navigation/rootNavigationRef';
import { radii } from '../theme';
import {
  LIVE_MINI_EDGE_PAD,
  LIVE_MINI_PLAYER_H,
  LIVE_MINI_PLAYER_W,
  useLiveActiveSessionOptional,
} from './LiveActiveSessionContext';
import { useLiveMiniPlayerOptional } from './LiveMiniPlayerContext';

function MiniOverlayHost({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{children}</FullWindowOverlay>;
  }
  return <>{children}</>;
}

/**
 * In-app mini chrome (drag / close / expand / pause).
 * Video pixels for Stage (and hoisted HLS) come from LiveActiveSessionSurface —
 * this overlay must NOT mount a second player for those sessions.
 */
export function LiveMiniPlayerOverlay() {
  const activeSession = useLiveActiveSessionOptional();
  const legacyMini = useLiveMiniPlayerOptional();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const usingHoisted = activeSession?.mode === 'mini' && Boolean(activeSession.session);
  const legacySession = !usingHoisted ? legacyMini?.session ?? null : null;
  const chromeSession = usingHoisted
    ? {
        roomId: activeSession!.session!.roomId,
        title: activeSession!.session!.title,
        hostLabel: activeSession!.session!.hostLabel,
        thumbnailUrl: activeSession!.session!.thumbnailUrl,
      }
    : legacySession
      ? {
          roomId: legacySession.roomId,
          title: legacySession.title,
          hostLabel: legacySession.hostLabel,
          thumbnailUrl: legacySession.thumbnailUrl,
        }
      : null;

  const paused = usingHoisted ? Boolean(activeSession?.paused) : Boolean(legacyMini?.paused);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bounds = useMemo(() => {
    const maxX = Math.max(LIVE_MINI_EDGE_PAD, winW - LIVE_MINI_PLAYER_W - LIVE_MINI_EDGE_PAD);
    const maxY = Math.max(
      LIVE_MINI_EDGE_PAD,
      winH - LIVE_MINI_PLAYER_H - insets.bottom - LIVE_MINI_EDGE_PAD,
    );
    const minY = insets.top + 8;
    return { maxX, maxY, minY };
  }, [winW, winH, insets.bottom, insets.top]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const [pos, setPos] = useState({ x: bounds.maxX, y: Math.max(bounds.minY, 72) });
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragOrigin = useRef({ x: 0, y: 0 });

  // Sync default top-right + share pos with the root surface.
  useEffect(() => {
    if (!chromeSession) return;
    setPos({ x: bounds.maxX, y: Math.max(bounds.minY, 72) });
  }, [chromeSession?.roomId, bounds.maxX, bounds.minY]);

  useEffect(() => {
    if (!usingHoisted || !activeSession) return;
    activeSession.setMiniPos(pos);
  }, [usingHoisted, activeSession, pos]);

  useEffect(() => {
    setPos((p) => ({
      x: Math.min(bounds.maxX, Math.max(LIVE_MINI_EDGE_PAD, p.x)),
      y: Math.min(bounds.maxY, Math.max(bounds.minY, p.y)),
    }));
  }, [bounds.maxX, bounds.maxY, bounds.minY]);

  const showControlsBriefly = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2_800);
  }, []);

  useEffect(() => {
    if (!chromeSession) return;
    showControlsBriefly();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [chromeSession?.roomId, showControlsBriefly]);

  const close = useCallback(() => {
    if (usingHoisted) activeSession?.close();
    else legacyMini?.close();
  }, [usingHoisted, activeSession, legacyMini]);

  const togglePaused = useCallback(() => {
    if (usingHoisted) activeSession?.togglePaused();
    else legacyMini?.togglePaused();
  }, [usingHoisted, activeSession, legacyMini]);

  const expandToLiveRoom = useCallback(() => {
    const roomId = chromeSession?.roomId;
    if (!roomId) return;
    if (usingHoisted) activeSession?.expand();
    if (!rootNavigationRef.isReady()) return;
    rootNavigationRef.navigate('MainTabs', {
      screen: 'Live',
      params: {
        screen: 'LiveRoom',
        params: { streamId: roomId },
      },
    });
  }, [chromeSession?.roomId, usingHoisted, activeSession]);

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
            x: Math.min(b.maxX, Math.max(LIVE_MINI_EDGE_PAD, dragOrigin.current.x + g.dx)),
            y: Math.min(b.maxY, Math.max(b.minY, dragOrigin.current.y + g.dy)),
          });
        },
        onPanResponderRelease: () => {
          const b = boundsRef.current;
          setPos((p) => ({
            x: p.x + LIVE_MINI_PLAYER_W / 2 < winW / 2 ? LIVE_MINI_EDGE_PAD : b.maxX,
            y: p.y,
          }));
        },
      }),
    [showControlsBriefly, winW],
  );

  if (!chromeSession) return null;

  const showLegacyVideo = Boolean(!usingHoisted && legacyMini?.playbackSourceUrl);

  return (
    <MiniOverlayHost>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill} collapsable={false}>
        <View
          style={[
            styles.shell,
            {
              left: pos.x,
              top: pos.y,
              width: LIVE_MINI_PLAYER_W,
              height: LIVE_MINI_PLAYER_H,
              // Hoisted surface paints video underneath — chrome shell is transparent.
              backgroundColor: usingHoisted ? 'transparent' : '#000',
            },
          ]}
          {...panResponder.panHandlers}
          collapsable={false}
        >
          <Pressable style={styles.surface} onPress={showControlsBriefly}>
            {showLegacyVideo && legacyMini ? (
              <VideoView
                player={legacyMini.player}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
                allowsPictureInPicture={false}
                startsPictureInPictureAutomatically={false}
                collapsable={false}
              />
            ) : null}
            {!usingHoisted && !showLegacyVideo && chromeSession.thumbnailUrl ? (
              <Image
                source={{ uri: chromeSession.thumbnailUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : null}

            {!controlsVisible ? (
              <View style={styles.livePill} pointerEvents="none">
                <View style={styles.liveDot} />
                <LiveRoomText style={styles.liveTxt}>LIVE</LiveRoomText>
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
                {chromeSession.title}
              </LiveRoomText>
              {chromeSession.hostLabel ? (
                <LiveRoomText style={styles.host} numberOfLines={1}>
                  {chromeSession.hostLabel}
                </LiveRoomText>
              ) : null}
            </View>
          </Pressable>
        </View>
      </View>
    </MiniOverlayHost>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    zIndex: 9999,
    elevation: 41,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  surface: {
    flex: 1,
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
    backgroundColor: '#ff3b30',
  },
  liveTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  controls: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  ctrlBtn: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  ctrlBtnCorner: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  ctrlClose: { top: 6, left: 6 },
  ctrlExpand: { top: 6, right: 6 },
  ctrlBtnCenter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    left: '50%',
    top: '50%',
    marginLeft: -22,
    marginTop: -22,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  caption: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  host: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
