import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import {
  LIVE_ROOM_CARD_TOTAL_HEIGHT,
  LiveRoomCardSkeletonRail,
} from '../components/home/LiveRoomCardSkeleton';
import { LiveNowPreviewCard, type LivePromoBadge } from '../components/home/LiveNowPreviewCard';
import { LiveEmptyBroadcastBlock } from '../components/live/LiveEmptyBroadcastBlock';
import { SearchBar } from '../components/ui/SearchBar';
import { scheduledStreamToLiveStream } from '../api/liveRoomsRepository';
import { discoveryCategoryChips, filterScheduledByChip, filterShowsByChip } from '../data/categoryTaxonomy';
import { useLiveDiscoverySync } from '../hooks/useLiveDiscoverySync';
import {
  clearHomeFeedCache,
  getHomeFeedMemorySnapshot,
  hasWarmHomeFeedCache,
  loadHomeFeedCache,
  saveHomeFeedCache,
} from '../lib/homeFeedCache';
import {
  orderLiveDiscoveryRooms,
  orderScheduledStreamsByStartTime,
  stabilizeLiveDiscoveryOrder,
} from '../lib/liveDiscoveryOrder';
import {
  markLiveDiscoveryFetchAttempt,
  markLiveDiscoveryFetchResult,
  shouldThrottleLiveDiscoveryFetch,
} from '../lib/liveDiscoveryFetchPolicy';
import { isSupabaseConfigured } from '../lib/supabase';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { useAuth } from '../auth/AuthContext';
import { useLiveEventReminders } from '../hooks/useLiveEventReminders';
import { liveStreamReminderTarget } from '../lib/liveEventReminder';
import { openSellerHQ } from '../navigation/openSellerHQ';
import type { LiveStackParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { openVaultSearch } from '../navigation/openPlatform';
import { computeLiveDiscoveryGrid } from '../lib/liveDiscoveryGrid';
import { colors, radii, spacing } from '../theme';
import { useMarketplaceLayout } from '../hooks/useMarketplaceLayout';
import type { LiveStream, ScheduledStream } from '../types';

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

function initialDiscoveryState(): { live: LiveStream[]; scheduled: ScheduledStream[] } {
  const snap = getHomeFeedMemorySnapshot();
  return { live: snap?.live ?? [], scheduled: snap?.scheduled ?? [] };
}

export function LiveDiscoveryScreen() {
  const insets = useSafeAreaInsets();
  const layout = useMarketplaceLayout();
  const { width: windowWidth } = useWindowDimensions();
  const {
    cols: gridCols,
    cardWidth: gridCardW,
    pad: gridPad,
    gap: gridGap,
  } = useMemo(() => computeLiveDiscoveryGrid(windowWidth), [windowWidth]);
  const navigation = useNavigation<NativeStackNavigationProp<LiveStackParamList>>();
  const { guestExploreMode } = useAuth();
  const { remind, isReminderSet } = useLiveEventReminders();
  const [chip, setChip] = useState<string>('All');
  const seed = initialDiscoveryState();
  const [initialLoad, setInitialLoad] = useState(() => seed.live.length === 0 && seed.scheduled.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [liveAll, setLiveAll] = useState<LiveStream[]>(seed.live);
  const [scheduledAll, setScheduledAll] = useState<ScheduledStream[]>(seed.scheduled);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  // Card order is locked between explicit refreshes so background polling/realtime viewer-count
  // updates never reshuffle the grid under a scrolling/tapping finger — see stabilizeLiveDiscoveryOrder.
  const stableOrderRef = useRef<{ chip: string; orderIds: string[] } | null>(null);

  const load = useCallback(async (opts?: { hadCache?: boolean; bustCache?: boolean; force?: boolean }) => {
    if (!isSupabaseConfigured() && !getWebApiBaseUrl()) {
      setDiscoveryError('Set EXPO_PUBLIC_SITE_URL to https://shopgetvaulted.com for live discovery.');
      setInitialLoad(false);
      return;
    }
    const force = Boolean(opts?.force || opts?.bustCache);
    if (shouldThrottleLiveDiscoveryFetch({ force })) return;
    // Explicit pull-to-refresh (bustCache) is the one moment a re-shuffle is expected/welcome.
    if (opts?.bustCache) stableOrderRef.current = null;

    markLiveDiscoveryFetchAttempt();
    if (opts?.hadCache) setRefreshing(true);
    if (opts?.bustCache) await clearHomeFeedCache();
    try {
      const pack = await fetchLiveShowsForDiscovery();
      if (!pack.meta.success) {
        setDiscoveryError(pack.meta.error);
        markLiveDiscoveryFetchResult(false, pack.meta.error);
        return;
      }
      markLiveDiscoveryFetchResult(true);
      setDiscoveryError(null);
      setLiveAll(pack.live);
      setScheduledAll(pack.scheduled);
      const prev = getHomeFeedMemorySnapshot();
      void saveHomeFeedCache({
        live: pack.live,
        scheduled: pack.scheduled,
        listings: prev?.listings ?? [],
      });
    } catch {
      markLiveDiscoveryFetchResult(false, 'Discovery fetch failed');
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
      const hadCache = Boolean(cache?.live.length || cache?.scheduled.length);
      if (cache) {
        if (cache.live.length) setLiveAll(cache.live);
        if (cache.scheduled.length) setScheduledAll(cache.scheduled);
        if (cache.live.length || cache.scheduled.length) setInitialLoad(false);
      }
      await load({ hadCache, force: !hadCache });
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useLiveDiscoverySync((opts) => load({ hadCache: opts?.hadCache, bustCache: opts?.bustCache, force: opts?.force }));

  const filteredLive = useMemo(() => filterShowsByChip(liveAll, chip), [liveAll, chip]);
  const filteredScheduled = useMemo(
    () => filterScheduledByChip(scheduledAll, chip),
    [scheduledAll, chip],
  );
  const orderedRooms = useMemo(() => {
    const fresh = orderLiveDiscoveryRooms(filteredLive);
    const prevIds = stableOrderRef.current?.chip === chip ? stableOrderRef.current.orderIds : null;
    const { result, nextOrderIds } = stabilizeLiveDiscoveryOrder(fresh, prevIds);
    stableOrderRef.current = { chip, orderIds: nextOrderIds };
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stableOrderRef is intentionally mutated, not a dep
  }, [filteredLive, chip]);
  const scheduledTiles = useMemo(
    () =>
      orderScheduledStreamsByStartTime(filteredScheduled).map((event) =>
        scheduledStreamToLiveStream(event),
      ),
    [filteredScheduled],
  );
  const gridTiles = useMemo(
    () => [
      ...orderedRooms.map((item) => ({
        stream: item.stream,
        kind: 'live' as const,
        promoBadge: item.promoBadge,
      })),
      ...scheduledTiles.map((stream) => ({
        stream,
        kind: 'scheduled' as const,
        promoBadge: undefined as LivePromoBadge | undefined,
      })),
    ],
    [orderedRooms, scheduledTiles],
  );

  const openShow = (streamId: string) => {
    if (guestExploreMode) {
      alertGuestLiveRestricted();
      return;
    }
    navigation.navigate('LiveRoom', { streamId });
  };

  const handleRemind = (stream: LiveStream) => {
    void remind(liveStreamReminderTarget(stream), () => alertGuestLiveRestricted());
  };

  const liveEmpty = !initialLoad && liveAll.length === 0 && scheduledAll.length === 0 && !discoveryError;
  const filterEmpty =
    !initialLoad &&
    liveAll.length > 0 &&
    filteredLive.length === 0 &&
    filteredScheduled.length === 0;
  const showSkeleton = initialLoad && gridTiles.length === 0;

  const renderRoom = ({ item }: { item: (typeof gridTiles)[number] }) => (
    <LiveNowPreviewCard
      stream={item.stream}
      promoBadge={item.promoBadge}
      layout="grid"
      gridWidth={gridCardW}
      onPress={() => openShow(item.stream.id)}
      onRemind={item.kind === 'scheduled' ? () => handleRemind(item.stream) : undefined}
      reminderSet={item.kind === 'scheduled' ? isReminderSet(item.stream.id) : false}
    />
  );

  const listHeader = (
    <>
      <SearchBar placeholder="Search sellers, live rooms, categories…" onPress={() => openVaultSearch()} />
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
      {discoveryError ? (
        <View style={styles.warnBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.live} style={styles.warnIcon} />
          <Text style={styles.configHint} numberOfLines={3}>
            {discoveryError}
          </Text>
        </View>
      ) : null}
      {refreshing && gridTiles.length > 0 ? (
        <Text style={styles.syncHint}>Updating vault events…</Text>
      ) : null}
      {showSkeleton ? (
        <View style={styles.skelSlot}>
          <LiveRoomCardSkeletonRail count={6} layout="grid" gridWidth={gridCardW} />
        </View>
      ) : null}
      {!showSkeleton && !liveEmpty && !filterEmpty && gridTiles.length > 0 ? (
        <View style={styles.liveHead}>
          <Text style={styles.liveTitle}>Live & upcoming</Text>
          <Text style={styles.liveCount}>{gridTiles.length} events</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingHorizontal: gridPad }]}>
      <FlatList
        data={showSkeleton || liveEmpty || filterEmpty ? [] : gridTiles}
        keyExtractor={(item) => item.stream.id}
        key={`live-grid-${gridCols}`}
        numColumns={gridCols}
        columnWrapperStyle={gridCols > 1 ? styles.gridRow : undefined}
        contentContainerStyle={[styles.body, { paddingBottom: layout.tabBarClearance }]}
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ hadCache: true, bustCache: true, force: true })}
            tintColor={colors.gold}
          />
        }
        renderItem={renderRoom}
        ListFooterComponent={<View style={{ height: spacing.md }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
  configHint: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.live,
    lineHeight: 15,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    minHeight: 44,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.22)',
    backgroundColor: 'rgba(40,18,18,0.55)',
  },
  warnIcon: {
    marginTop: 1,
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
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
});
