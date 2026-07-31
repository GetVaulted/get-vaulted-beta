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
import { useLiveMiniPlayerOptional } from '../live/LiveMiniPlayerContext';
import { useKeepScreenAwakeWhileFocused } from '../hooks/useKeepScreenAwakeWhileFocused';
import { viewerLifecycleLog } from '../lib/viewerLifecycleLog';
import { colors } from '../theme';
import type { LiveStream } from '../types';

function seedStreamsFromCache(streamId: string): { streams: LiveStream[]; ready: boolean } {
  const cached = getHomeFeedMemorySnapshot()?.live ?? [];
  if (!cached.length) return { streams: [], ready: false };
  return { streams: cached, ready: cached.some((s) => s.id === streamId) };
}

export function LiveRoomScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const route = useRoute<RouteProp<LiveStackParamList, 'LiveRoom'>>();
  const { streamId } = route.params;
  const { user, guestExploreMode, session } = useAuth();
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

  useKeepScreenAwakeWhileFocused('live-room-buyer');

  const reloadStreams = useCallback(async () => {
    if (!isSupabaseConfigured() && !getWebApiBaseUrl()) {
      setStreams([]);
      setLoading(false);
      return;
    }

    const cache = getHomeFeedMemorySnapshot() ?? (await loadHomeFeedCache());
    if (cache?.live.length) {
      setStreams(cache.live);
      if (cache.live.some((s) => s.id === streamId)) {
        setLoading(false);
      }
    }

    try {
      const pack = await fetchLiveShowsForDiscovery();
      let next = pack.live;
      if (streamId && !next.some((s) => s.id === streamId)) {
        const row = await fetchLiveRoomPublicById(streamId);
        if (row && (row.status === 'live' || row.status === 'scheduled')) {
          next = [liveRoomRowToLiveStream(row), ...next];
        }
      }
      setStreams(next);
      if (next.length) {
        const start = next.findIndex((s) => s.id === streamId);
        const warm = [start, start - 1, start + 1]
          .filter((i) => i >= 0 && i < next.length)
          .map((i) => next[i]!.id);
        prefetchLiveStreamRooms(warm, session?.access_token);
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, streamId]);

  useFocusEffect(
    useCallback(() => {
      // Soft visit bump (wallet/session resets) — do NOT remount the whole feed via React key;
      // remount racing IVS leave/join blanks video until app kill.
      viewerLifecycleLog('screen_focused', { streamId, layer: 'LiveRoomScreen' });
      // Close mini only when (re)entering this room. Read via ref — do NOT put session/roomId in
      // deps or leave→minimize updates the context and re-runs this effect while still focused,
      // which immediately clears the floating player.
      const mp = miniPlayerRef.current;
      if (mp?.session?.roomId === streamId) {
        mp.close();
      }
      setRoomVisitNonce((n) => n + 1);
      void reloadStreams();
      return () => {
        viewerLifecycleLog('screen_blurred', { streamId, layer: 'LiveRoomScreen' });
      };
    }, [reloadStreams, streamId]),
  );

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
    <LiveStripeProvider accessToken={session?.access_token}>
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
          signedIn={Boolean(user)}
          onRequireAuth={onRequireAuth}
          accessToken={session?.access_token}
          userId={user?.id}
        />
      </View>
    </LiveStripeProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
