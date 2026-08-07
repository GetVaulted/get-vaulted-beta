import { useNavigation, useRoute, useFocusEffect, useIsFocused, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { fetchLiveRoomPublicById, liveRoomRowToLiveStream } from '../api/liveRoomsRepository';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { LiveStripeProvider } from '../components/live/LiveStripeProvider';
import { VerticalLiveFeed } from '../components/live/VerticalLiveFeed';
import { prefetchLiveStreamRooms } from '../lib/liveStreamPrefetchCache';
import { getHomeFeedMemorySnapshot, loadHomeFeedCache } from '../lib/homeFeedCache';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import type { LiveStackParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { navigateAuthLogin, navigateAuthSignUp } from '../navigation/rootNavigationRef';
import { useLiveActiveSessionOptional } from '../live/LiveActiveSessionContext';
import { useLiveMiniPlayerOptional } from '../live/LiveMiniPlayerContext';
import { useKeepScreenAwakeWhileFocused } from '../hooks/useKeepScreenAwakeWhileFocused';
import { useStickyLiveAuth } from '../hooks/useStickyLiveAuth';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';
import { pinSelectedLiveStream, mergeLiveFeedStreams } from '../lib/pinSelectedLiveStream';
import { colors } from '../theme';
import type { LiveStream } from '../types';

function seedStreamsFromCache(streamId: string): { streams: LiveStream[]; ready: boolean } {
  const cached = getHomeFeedMemorySnapshot()?.live ?? [];
  if (!cached.length) return { streams: [], ready: false };
  const pinned = pinSelectedLiveStream(cached, streamId);
  return { streams: pinned, ready: pinned.some((s) => s.id === streamId) };
}

export function LiveRoomScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const route = useRoute<RouteProp<LiveStackParamList, 'LiveRoom'>>();
  const { streamId } = route.params;
  const { user, guestExploreMode, session, lastAuthEvent } = useAuth();
  const liveAuth = useStickyLiveAuth({ user, session, lastAuthEvent });
  const seed = useMemo(() => seedStreamsFromCache(streamId), [streamId]);
  const [streams, setStreams] = useState<LiveStream[]>(seed.streams);
  const [loading, setLoading] = useState(!seed.ready);
  const [roomVisitNonce, setRoomVisitNonce] = useState(0);
  // Drives full playback teardown when the buyer leaves this screen (back / tab switch / pushed
  // screen). `useIsFocused` is false whenever any parent navigator is also unfocused, so it covers
  // the tab-switch case where the screen stays mounted and would otherwise keep playing audio.
  const isFocused = useIsFocused();
  const miniPlayer = useLiveMiniPlayerOptional();
  const miniPlayerRef = useRef(miniPlayer);
  miniPlayerRef.current = miniPlayer;
  const activeSession = useLiveActiveSessionOptional();
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  useKeepScreenAwakeWhileFocused('live-room-buyer');

  const applyStreams = useCallback(
    (next: LiveStream[] | ((prev: LiveStream[]) => LiveStream[]), opts?: { pinSelected?: boolean }) => {
      setStreams((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        // Pin only on cold open — mid-session re-pin reorders under the pager (random swipe).
        if (opts?.pinSelected || prev.length === 0) {
          return pinSelectedLiveStream(resolved, streamId);
        }
        return mergeLiveFeedStreams(prev, resolved);
      });
    },
    [streamId],
  );

  const reloadStreams = useCallback(async () => {
    if (!isSupabaseConfigured() && !getWebApiBaseUrl()) {
      applyStreams([]);
      setLoading(false);
      return;
    }

    const cache = getHomeFeedMemorySnapshot() ?? (await loadHomeFeedCache());
    if (cache?.live.length) {
      applyStreams(cache.live);
      if (cache.live.some((s) => s.id === streamId)) {
        setLoading(false);
      }
    }

    // Prefer the single room first so video paints without waiting on the full discovery directory.
    try {
      let singleRoom: LiveStream | null = null;
      if (streamId) {
        const row = await fetchLiveRoomPublicById(streamId);
        if (row && (row.status === 'live' || row.status === 'scheduled')) {
          singleRoom = liveRoomRowToLiveStream(row);
          applyStreams((prev) => {
            if (prev.some((s) => s.id === streamId)) {
              return prev.map((s) => (s.id === streamId ? { ...s, ...singleRoom! } : s));
            }
            return [singleRoom!, ...prev];
          });
          setLoading(false);
          prefetchLiveStreamRooms([streamId], session?.access_token);
        }
      }

      const pack = await fetchLiveShowsForDiscovery();
      let next = pack.live;
      if (streamId && !next.some((s) => s.id === streamId)) {
        if (singleRoom) {
          next = [singleRoom, ...next];
        } else {
          const cachedRow = cache?.live.find((s) => s.id === streamId);
          if (cachedRow) {
            next = [cachedRow, ...next];
          }
        }
      }
      applyStreams(next);
      if (streamId) {
        prefetchLiveStreamRooms([streamId], session?.access_token);
      }
    } finally {
      setLoading(false);
    }
  }, [applyStreams, session?.access_token, streamId]);

  useFocusEffect(
    useCallback(() => {
      // Soft visit — do NOT remount the whole feed via React key;
      // remount racing IVS leave/join blanks video until app kill.
      viewerLifecycleLog('screen_focused', { streamId, layer: 'LiveRoomScreen' });
      const as = activeSessionRef.current;
      const mp = miniPlayerRef.current;
      const softResume =
        Boolean(as?.session?.roomId === streamId) &&
        (as?.mode === 'mini' || Boolean(as?.wasMinimizedRecently(8_000)));
      if (softResume && as) {
        // Same Stage surface — restore room layout; do not tear down subscribe.
        as.expand();
        void reloadStreams();
        return () => {
          viewerLifecycleLog('screen_blurred', { streamId, layer: 'LiveRoomScreen' });
        };
      }
      if (as?.mode === 'mini' && as.session && as.session.roomId !== streamId) {
        as.close();
      }
      const resumingLegacyMini = mp?.session?.roomId === streamId;
      if (resumingLegacyMini) {
        void reloadStreams();
        const dismissTimer = setTimeout(() => {
          const cur = miniPlayerRef.current;
          if (cur?.session?.roomId === streamId) cur.close();
        }, 1_000);
        return () => {
          clearTimeout(dismissTimer);
          viewerLifecycleLog('screen_blurred', { streamId, layer: 'LiveRoomScreen' });
        };
      }
      if (mp?.session) {
        mp.close();
      }
      void reloadStreams();
      return () => {
        viewerLifecycleLog('screen_blurred', { streamId, layer: 'LiveRoomScreen' });
      };
    }, [reloadStreams, streamId]),
  );

  // First entry / stream change — re-seed the pager list so we don't paint the prior show.
  useLayoutEffect(() => {
    setStreams(seed.streams);
    setLoading(!seed.ready);
    const as = activeSessionRef.current;
    const softResume =
      Boolean(as?.session?.roomId === streamId) &&
      (as?.mode === 'mini' || Boolean(as?.wasMinimizedRecently(8_000)));
    // Soft expand must not bump visit nonce — that remounts Stage and looks like a reload.
    if (!softResume) {
      setRoomVisitNonce((n) => n + 1);
    }
  }, [streamId, seed]);

  const blockGuestLive = guestExploreMode && !user;

  useLayoutEffect(() => {
    if (!blockGuestLive) return;
    navigation.goBack();
    alertGuestLiveRestricted();
  }, [blockGuestLive, navigation]);

  const onRequireAuth = useCallback(() => {
    Alert.alert('Account required', 'Log in to chat, follow, shop, and bid in live rooms.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log in', onPress: navigateAuthLogin },
      { text: 'Create account', onPress: navigateAuthSignUp },
    ]);
  }, []);

  if (blockGuestLive) {
    return <View style={styles.screen} />;
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <LiveStripeProvider accessToken={liveAuth.accessToken}>
      <View style={styles.screen}>
        <VerticalLiveFeed
          streams={streams}
          initialStreamId={streamId}
          roomVisitNonce={roomVisitNonce}
          screenFocused={isFocused}
          onBack={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }
            navigation.navigate('LiveDiscovery');
          }}
          signedIn={liveAuth.signedIn}
          onRequireAuth={onRequireAuth}
          accessToken={liveAuth.accessToken}
          userId={liveAuth.userId}
        />
      </View>
    </LiveStripeProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
