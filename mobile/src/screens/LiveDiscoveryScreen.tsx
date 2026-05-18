import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import {
  LIVE_ROOM_CARD_TOTAL_HEIGHT,
  LiveRoomCardSkeletonRail,
} from '../components/home/LiveRoomCardSkeleton';
import { LiveNowPreviewCard } from '../components/home/LiveNowPreviewCard';
import { LiveEmptyBroadcastBlock } from '../components/live/LiveEmptyBroadcastBlock';
import { SearchBar } from '../components/ui/SearchBar';
import { discoveryCategoryChips, filterShowsByChip } from '../data/categoryTaxonomy';
import {
  getHomeFeedMemorySnapshot,
  hasWarmHomeFeedCache,
  loadHomeFeedCache,
  saveHomeFeedCache,
} from '../lib/homeFeedCache';
import { orderLiveDiscoveryRooms, type OrderedLiveRoom } from '../lib/liveDiscoveryOrder';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { openSellerHQ } from '../navigation/openSellerHQ';
import type { LiveStackParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { openHelpCenter } from '../navigation/openPlatform';
import { colors, radii, spacing } from '../theme';
import type { LiveStream } from '../types';

const SCREEN_W = Dimensions.get('window').width;
const GRID_PAD = spacing.lg;
const GRID_GAP = spacing.sm;
const GRID_COLS = 2;
const GRID_CARD_W = (SCREEN_W - GRID_PAD * 2 - GRID_GAP) / GRID_COLS;

function liveChipIcon(label: string): keyof typeof Ionicons.glyphMap | undefined {
  switch (label) {
    case 'Sports Cards':
      return 'layers-outline';
    case 'Trading Cards':
      return 'albums-outline';
    case 'Memorabilia':
      return 'shirt-outline';
    case 'Sneakers':
      return 'footsteps-outline';
    case 'Watches':
      return 'time-outline';
    case 'Sealed':
      return 'cube-outline';
    case 'Vault Drops':
      return 'archive-outline';
    case 'Other Collectibles':
      return 'apps-outline';
    case 'All':
      return 'grid-outline';
    default:
      return undefined;
  }
}

function chipInactiveAccent(label: string): { border: string; fill: string } {
  switch (label) {
    case 'Sports Cards':
      return { border: 'rgba(110, 200, 190, 0.28)', fill: 'rgba(18, 32, 30, 0.96)' };
    case 'Trading Cards':
      return { border: 'rgba(130, 150, 255, 0.28)', fill: 'rgba(26, 28, 44, 0.96)' };
    case 'Memorabilia':
      return { border: 'rgba(230, 150, 110, 0.28)', fill: 'rgba(36, 24, 20, 0.96)' };
    case 'Sneakers':
      return { border: 'rgba(140, 170, 255, 0.24)', fill: 'rgba(24, 26, 40, 0.96)' };
    case 'Watches':
      return { border: 'rgba(212, 175, 55, 0.26)', fill: 'rgba(32, 28, 18, 0.96)' };
    case 'Sealed':
      return { border: 'rgba(200, 165, 95, 0.28)', fill: 'rgba(34, 28, 18, 0.96)' };
    case 'Vault Drops':
      return { border: 'rgba(200, 165, 95, 0.28)', fill: 'rgba(34, 28, 18, 0.96)' };
    case 'Other Collectibles':
      return { border: 'rgba(140, 180, 220, 0.26)', fill: 'rgba(22, 28, 36, 0.96)' };
    case 'All':
    default:
      return { border: 'rgba(255,255,255,0.14)', fill: 'rgba(28,28,28,0.94)' };
  }
}

function initialLiveState(): LiveStream[] {
  return getHomeFeedMemorySnapshot()?.live ?? [];
}

export function LiveDiscoveryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const { guestExploreMode } = useAuth();
  const [chip, setChip] = useState<string>('All');
  const [initialLoad, setInitialLoad] = useState(() => initialLiveState().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [liveAll, setLiveAll] = useState<LiveStream[]>(initialLiveState);

  const load = useCallback(async (opts?: { hadCache?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setInitialLoad(false);
      return;
    }
    if (opts?.hadCache) setRefreshing(true);
    try {
      const pack = await fetchLiveShowsForDiscovery();
      setLiveAll(pack.live);
      const prev = getHomeFeedMemorySnapshot();
      void saveHomeFeedCache({
        live: pack.live,
        scheduled: prev?.scheduled ?? [],
        listings: prev?.listings ?? [],
      });
    } catch {
      /* keep cached rows */
    } finally {
      setInitialLoad(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const warm = hasWarmHomeFeedCache();
      const cache = warm ? getHomeFeedMemorySnapshot() : await loadHomeFeedCache();
      if (cancelled) return;
      const hadCache = Boolean(cache?.live.length ?? liveAll.length);
      if (cache?.live.length && !liveAll.length) {
        setLiveAll(cache.live);
        setInitialLoad(false);
      }
      await load({ hadCache });
    })();
    return () => {
      cancelled = true;
    };
  }, [load, liveAll.length]);

  const filteredLive = useMemo(() => filterShowsByChip(liveAll, chip), [liveAll, chip]);
  const orderedRooms = useMemo(() => orderLiveDiscoveryRooms(filteredLive), [filteredLive]);

  const openShow = (streamId: string) => {
    if (guestExploreMode) {
      alertGuestLiveRestricted();
      return;
    }
    navigation.navigate('LiveRoom', { streamId });
  };

  const liveEmpty = !initialLoad && liveAll.length === 0;
  const filterEmpty = !initialLoad && liveAll.length > 0 && filteredLive.length === 0;
  const showSkeleton = initialLoad && orderedRooms.length === 0;

  const renderRoom = ({ item }: { item: OrderedLiveRoom }) => (
    <LiveNowPreviewCard
      stream={item.stream}
      promoBadge={item.promoBadge}
      layout="grid"
      gridWidth={GRID_CARD_W}
      onPress={() => openShow(item.stream.id)}
    />
  );

  const listHeader = (
    <>
      <SearchBar placeholder="Search sellers, live rooms, categories…" onPress={() => openHelpCenter(undefined, true)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {discoveryCategoryChips.map((c) => {
          const on = c === chip;
          const icon = liveChipIcon(c);
          const tone = chipInactiveAccent(c);
          return (
            <Pressable
              key={c}
              onPress={() => setChip(c)}
              style={[
                styles.chip,
                !on && { borderColor: tone.border, backgroundColor: tone.fill },
                on && styles.chipOn,
              ]}
            >
              {icon ? (
                <Ionicons
                  name={icon}
                  size={17}
                  color={on ? colors.gold : 'rgba(245,245,245,0.58)'}
                  style={styles.chipIcon}
                />
              ) : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {c}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {refreshing && orderedRooms.length > 0 ? (
        <Text style={styles.syncHint}>Updating live rooms…</Text>
      ) : null}
      {showSkeleton ? (
        <View style={styles.skelSlot}>
          <LiveRoomCardSkeletonRail count={6} />
        </View>
      ) : null}
      {!showSkeleton && !liveEmpty && !filterEmpty ? (
        <View style={styles.liveHead}>
          <Text style={styles.liveTitle}>Live now</Text>
          <Text style={styles.liveCount}>{orderedRooms.length} rooms</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <FlatList
        data={showSkeleton || liveEmpty || filterEmpty ? [] : orderedRooms}
        keyExtractor={(item) => item.stream.id}
        numColumns={GRID_COLS}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          liveEmpty ? (
            <LiveEmptyBroadcastBlock
              onStartLive={() => {
                const tab = navigation.getParent();
                if (tab) openSellerHQ(tab, { tab: 'live', openSchedule: true });
              }}
            />
          ) : filterEmpty ? (
            <PremiumEmptyPanel
              icon="funnel-outline"
              title="No rooms in this lane"
              subtitle="Try another category or check back as sellers go live."
            />
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load({ hadCache: true })} tintColor={colors.gold} />
        }
        renderItem={renderRoom}
        ListFooterComponent={<View style={{ height: 120 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: GRID_PAD,
  },
  body: {
    paddingBottom: spacing.xxl,
  },
  syncHint: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  skelSlot: {
    minHeight: LIVE_ROOM_CARD_TOTAL_HEIGHT,
    marginBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(28,28,28,0.94)',
  },
  chipOn: {
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(212,175,55,0.14)',
  },
  chipIcon: { marginRight: 7 },
  chipText: {
    color: 'rgba(245,245,245,0.88)',
    fontWeight: '600',
    fontSize: 14,
  },
  chipTextOn: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  liveHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  liveTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  liveCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
});
