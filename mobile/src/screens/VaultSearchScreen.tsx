import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { searchPeopleUsers, type PeopleSearchUser } from '../api/peopleSearchRepository';
import { useAuth } from '../auth/AuthContext';
import { SearchBar } from '../components/ui/SearchBar';
import { UserAvatar } from '../components/ui/UserAvatar';
import { VaultImage } from '../components/ui/VaultImage';
import {
  filterLiveStreamsByQuery,
  filterProductsByQuery,
  filterScheduledStreamsByQuery,
} from '../lib/vaultSearch';
import { isSupabaseConfigured } from '../lib/supabase';
import { openUserProfile } from '../navigation/openPlatform';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, radii, spacing } from '../theme';
import type { LiveStream, Product, ScheduledStream } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'VaultSearch'>;

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList, 'VaultSearch'>,
  BottomTabNavigationProp<MainTabParamList>
>;

const PEOPLE_DEBOUNCE_MS = 280;

export function VaultSearchScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<Product[]>([]);
  const [live, setLive] = useState<LiveStream[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledStream[]>([]);
  const [people, setPeople] = useState<PeopleSearchUser[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const peopleGen = useRef(0);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setListings([]);
      setLive([]);
      setScheduled([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [products, livePack] = await Promise.all([
        fetchMarketplaceListings({ limit: 48 }),
        fetchLiveShowsForDiscovery(),
      ]);
      setListings(products);
      setLive(livePack.live);
      setScheduled(livePack.scheduled);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const q = query.trim().replace(/^@+/, '');
    if (q.length < 1) {
      setPeople([]);
      setPeopleLoading(false);
      return;
    }
    const gen = ++peopleGen.current;
    setPeopleLoading(true);
    const handle = setTimeout(() => {
      void searchPeopleUsers(token, q).then((users) => {
        if (gen !== peopleGen.current) return;
        setPeople(users);
        setPeopleLoading(false);
      });
    }, PEOPLE_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [query, token]);

  const filteredListings = useMemo(() => filterProductsByQuery(listings, query), [listings, query]);
  const filteredLive = useMemo(() => filterLiveStreamsByQuery(live, query), [live, query]);
  const filteredScheduled = useMemo(
    () => filterScheduledStreamsByQuery(scheduled, query),
    [scheduled, query],
  );
  const hasQuery = query.trim().length > 0;
  const empty =
    hasQuery &&
    !loading &&
    !peopleLoading &&
    people.length === 0 &&
    filteredListings.length === 0 &&
    filteredLive.length === 0 &&
    filteredScheduled.length === 0;

  const openLiveRoom = (streamId: string) => {
    navigation.navigate('MainTabs', {
      screen: 'Live',
      params: { screen: 'LiveRoom', params: { streamId } },
    });
  };

  const openProduct = (productId: string) => {
    navigation.navigate('ProductDetail', { productId });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.searchWrap}>
          <SearchBar
            placeholder="Search people, listings, live…"
            value={query}
            onChangeText={setQuery}
            autoFocus={!route.params?.initialQuery}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!hasQuery ? (
            <Text style={styles.hint}>
              Search usernames to follow people, plus marketplace listings and live rooms.
            </Text>
          ) : null}
          {empty ? (
            <Text style={styles.empty}>
              No results for “{query.trim()}”. Try a username, listing keyword, or browse Marketplace.
            </Text>
          ) : null}

          {hasQuery ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>People</Text>
              {peopleLoading && people.length === 0 ? (
                <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.sm }} />
              ) : null}
              {!peopleLoading && people.length === 0 ? (
                <Text style={styles.peopleEmpty}>No users match that username.</Text>
              ) : null}
              {people.map((user) => (
                <Pressable
                  key={user.id}
                  style={styles.row}
                  onPress={() => openUserProfile(user.id, navigation as Nav)}
                >
                  <UserAvatar uri={user.image} username={user.username} size={52} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      @{user.username}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {user.followerCount.toLocaleString()} follower
                      {user.followerCount === 1 ? '' : 's'}
                      {user.following ? ' · Following' : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {filteredLive.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Live now</Text>
              {filteredLive.map((stream) => (
                <Pressable key={stream.id} style={styles.row} onPress={() => openLiveRoom(stream.id)}>
                  <VaultImage uri={stream.previewImageUrl} width={52} height={52} borderRadius={radii.md} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {stream.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      @{stream.host.handle || stream.host.name} · {stream.viewers} watching
                    </Text>
                  </View>
                  <View style={styles.livePill}>
                    <Text style={styles.livePillTxt}>Live</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {filteredScheduled.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming shows</Text>
              {filteredScheduled.map((stream) => (
                <Pressable key={stream.id} style={styles.row} onPress={() => openLiveRoom(stream.id)}>
                  <VaultImage uri={stream.previewImageUrl} width={52} height={52} borderRadius={radii.md} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {stream.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      @{stream.host.handle || stream.host.name} · {stream.startsAt}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {filteredListings.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Marketplace</Text>
              {filteredListings.map((product) => (
                <Pressable key={product.id} style={styles.row} onPress={() => openProduct(product.id)}>
                  <VaultImage uri={product.imageUrl} width={52} height={52} borderRadius={radii.md} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {product.title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {product.listingPrice} · @{product.seller.handle || product.seller.name}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 32 },
  searchWrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.lg },
  hint: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginBottom: spacing.sm },
  empty: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  peopleEmpty: { fontSize: 12, lineHeight: 16, color: colors.textMuted, marginBottom: spacing.xs },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted },
  livePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  livePillTxt: { fontSize: 10, fontWeight: '800', color: '#fca5a5', textTransform: 'uppercase' },
});
