import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { VerticalLiveFeed } from '../components/live/VerticalLiveFeed';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import type { LiveStackParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { navigateAuthLogin, navigateAuthSignUp } from '../navigation/rootNavigationRef';
import { colors } from '../theme';
import type { LiveStream } from '../types';

export function LiveRoomScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const route = useRoute<RouteProp<LiveStackParamList, 'LiveRoom'>>();
  const { streamId } = route.params;
  const { user, guestExploreMode, session } = useAuth();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);

  const blockGuestLive = guestExploreMode && !user;

  useLayoutEffect(() => {
    if (!blockGuestLive) return;
    navigation.goBack();
    alertGuestLiveRestricted();
  }, [blockGuestLive, navigation]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setStreams([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const pack = await fetchLiveShowsForDiscovery();
        if (!cancelled) setStreams(pack.live);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        bottomOffset={insets.bottom + 8}
        onBack={() => navigation.goBack()}
        signedIn={Boolean(user)}
        onRequireAuth={onRequireAuth}
        accessToken={session?.access_token}
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
