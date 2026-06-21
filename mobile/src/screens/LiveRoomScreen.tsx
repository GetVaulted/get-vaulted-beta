import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { fetchLiveRoomPublicById, liveRoomRowToLiveStream } from '../api/liveRoomsRepository';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { VerticalLiveFeed } from '../components/live/VerticalLiveFeed';
import { getHomeFeedMemorySnapshot, loadHomeFeedCache } from '../lib/homeFeedCache';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import type { LiveStackParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { navigateAuthLogin, navigateAuthSignUp } from '../navigation/rootNavigationRef';
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

  const blockGuestLive = guestExploreMode && !user;

  useLayoutEffect(() => {
    if (!blockGuestLive) return;
    navigation.goBack();
    alertGuestLiveRestricted();
  }, [blockGuestLive, navigation]);

  useEffect(() => {
    if (!isSupabaseConfigured() && !getWebApiBaseUrl()) {
      setStreams([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const cache = getHomeFeedMemorySnapshot() ?? (await loadHomeFeedCache());
      if (cancelled) return;

      if (cache?.live.length) {
        setStreams(cache.live);
        if (cache.live.some((s) => s.id === streamId)) {
          setLoading(false);
        }
      }

      try {
        const pack = await fetchLiveShowsForDiscovery();
        if (cancelled) return;
        let next = pack.live;
        if (streamId && !next.some((s) => s.id === streamId)) {
          const row = await fetchLiveRoomPublicById(streamId);
          if (row && (row.status === 'live' || row.status === 'scheduled')) {
            next = [liveRoomRowToLiveStream(row), ...next];
          }
        }
        setStreams(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [streamId]);

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
    <View style={styles.screen}>
      <VerticalLiveFeed
        streams={streams}
        initialStreamId={streamId}
        onBack={() => navigation.goBack()}
        signedIn={Boolean(user)}
        onRequireAuth={onRequireAuth}
        accessToken={session?.access_token}
        userId={user?.id}
      />
    </View>
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
