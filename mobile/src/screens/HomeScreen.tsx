import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../api/liveRoomsRepository';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { HomeCultureHero } from '../components/home/HomeCultureHero';
import { HomeFeedSyncHint } from '../components/home/HomeFeedSyncHint';
import { HomeSellerEventBanner } from '../components/home/HomeSellerEventBanner';
import { HomeSellerOnboardingStrip } from '../components/home/HomeSellerOnboardingStrip';
import { HotClipCard } from '../components/home/HotClipCard';
import {
  LIVE_ROOM_CARD_SNAP,
  LiveNowPreviewCard,
} from '../components/home/LiveNowPreviewCard';
import { LIVE_ROOM_CARD_TOTAL_HEIGHT, LiveRoomCardSkeletonRail } from '../components/home/LiveRoomCardSkeleton';
import {
  MARKETPLACE_RAIL_CARD_HEIGHT,
  MarketplaceCardSkeletonRail,
} from '../components/home/MarketplaceCardSkeleton';
import { VaultDropCard } from '../components/home/VaultDropCard';
import { BrandLogo } from '../components/ui/BrandLogo';
import { LiveEmptyBroadcastBlock } from '../components/live/LiveEmptyBroadcastBlock';
import { ProductCard } from '../components/ui/ProductCard';
import { SearchBar } from '../components/ui/SearchBar';
import { SectionHeader } from '../components/ui/SectionHeader';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import { openCreateListing } from '../navigation/openCreateListing';
import {
  getHomeFeedMemorySnapshot,
  hasWarmHomeFeedCache,
  loadHomeFeedCache,
  saveHomeFeedCache,
  subscribeHomeFeedInvalidation,
} from '../lib/homeFeedCache';
import { isSupabaseConfigured } from '../lib/supabase';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { useAuth } from '../auth/AuthContext';
import { useSellerStripeConnect } from '../hooks/useSellerStripeConnect';
import { isSellerHQApproved } from '../lib/sellerHubEntry';
import type { SellerHQEntryPhase } from '../lib/sellerHubEntry';
import { openMessagesInbox } from '../navigation/openMessages';
import { NotificationBadge } from '../components/platform/NotificationBadge';
import { useNotificationBadge } from '../hooks/useNotificationBadge';
import { openHelpCenter, openMyOrders, openNotificationInbox, openSettings } from '../navigation/openPlatform';
import { confirmAndSignOut } from '../lib/signOutSession';
import { countActiveBuyerOrders } from '../api/ordersRepository';
import { openSellerHostRoom } from '../navigation/openSellerHostRoom';
import { openSellerHQ } from '../navigation/openSellerHQ';
import { navigateAuthSignUp } from '../navigation/rootNavigationRef';
import { colors, radii, spacing } from '../theme';
import type { HotClip, LiveStream, Product, ScheduledStream } from '../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

function initialFeedState() {
  const snapshot = getHomeFeedMemorySnapshot();
  return {
    liveRows: snapshot?.live ?? [],
    scheduledRows: snapshot?.scheduled ?? [],
    listings: snapshot?.listings ?? [],
    hasCache: Boolean(snapshot?.live.length || snapshot?.listings?.length),
  };
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, guestExploreMode, session, signOut } = useAuth();
  const { count: notificationCount } = useNotificationBadge(user?.id);
  const sellerConnect = useSellerStripeConnect(session?.access_token);

  const seed = useMemo(() => initialFeedState(), []);
  const [initialLoad, setInitialLoad] = useState(!seed.hasCache);
  const [refreshing, setRefreshing] = useState(false);
  const [listings, setListings] = useState<Product[]>(seed.listings);
  const [liveRows, setLiveRows] = useState<LiveStream[]>(seed.liveRows);
  const [scheduledRows, setScheduledRows] = useState<ScheduledStream[]>(seed.scheduledRows);
  const [clips, setClips] = useState<HotClip[]>([]);
  const [sellerNextRoom, setSellerNextRoom] = useState<LiveRoomApiRow | null>(null);
  const [activeBuyerOrders, setActiveBuyerOrders] = useState(0);

  const sellerApproved = isSellerHQApproved(sellerConnect.status);

  useEffect(() => {
    if (!user?.id) {
      setActiveBuyerOrders(0);
      return;
    }
    const task = deferAfterFirstPaint(() => {
      void countActiveBuyerOrders(user.id).then(setActiveBuyerOrders);
    }, 1200);
    return () => task.cancel();
  }, [user?.id]);

  const loadFeed = useCallback(async (opts?: { hadCachedLive?: boolean; hadCachedListings?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setClips([]);
      setSellerNextRoom(null);
      setInitialLoad(false);
      setRefreshing(false);
      return;
    }

    if (opts?.hadCachedLive || opts?.hadCachedListings) setRefreshing(true);

    try {
      const sellerFetch =
        sellerApproved && session?.access_token
          ? fetchMyLiveRooms(session.access_token).catch(() => [] as LiveRoomApiRow[])
          : Promise.resolve([] as LiveRoomApiRow[]);

      const [products, livePack, myRooms] = await Promise.all([
        fetchMarketplaceListings({ limit: 24 }),
        fetchLiveShowsForDiscovery(),
        sellerFetch,
      ]);

      setLiveRows(livePack.live);
      setScheduledRows(livePack.scheduled);
      setClips([]);

      setListings(products);

      const upcoming = myRooms
        .filter((r) => r.status === 'scheduled' && r.scheduledStartAt)
        .sort((a, b) => {
          const ta = new Date(a.scheduledStartAt!).getTime();
          const tb = new Date(b.scheduledStartAt!).getTime();
          return ta - tb;
        })[0];
      setSellerNextRoom(upcoming ?? null);

      void saveHomeFeedCache({
        live: livePack.live,
        scheduled: livePack.scheduled,
        listings: products.length ? products : [],
      });
    } finally {
      setInitialLoad(false);
      setRefreshing(false);
    }
  }, [sellerApproved, session?.access_token]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const warm = hasWarmHomeFeedCache();
      const cache = warm ? getHomeFeedMemorySnapshot() : await loadHomeFeedCache();
      if (cancelled) return;

      const hadCachedLive = Boolean(cache?.live.length ?? seed.liveRows.length);
      const hadCachedListings = Boolean(cache?.listings.length ?? (seed.hasCache && seed.listings.length > 0));

      if (cache) {
        if (!warm) {
          if (cache.live.length) setLiveRows(cache.live);
          if (cache.scheduled.length) setScheduledRows(cache.scheduled);
          if (cache.listings.length) setListings(cache.listings);
        }
        if (cache.live.length || cache.listings.length) {
          setInitialLoad(false);
        }
      }
      await loadFeed({ hadCachedLive, hadCachedListings });
    })();

    return () => {
      cancelled = true;
    };
  }, [loadFeed, seed.hasCache, seed.liveRows.length, seed.listings.length]);

  useEffect(() => {
    return subscribeHomeFeedInvalidation(() => {
      void loadFeed();
    });
  }, [loadFeed]);

  useFocusEffect(
    useCallback(() => {
      if (!hasWarmHomeFeedCache()) {
        void loadFeed();
      }
    }, [loadFeed]),
  );

  const goLive = () => {
    navigation.navigate('Live', { screen: 'LiveDiscovery' });
  };

  const onSellerOnboarding = (phase: SellerHQEntryPhase) => {
    if (phase === 'guest') {
      navigateAuthSignUp();
      return;
    }
    openSellerHQ(navigation, { tab: 'overview' });
  };

  const openLiveShow = (streamId: string) => {
    if (guestExploreMode) {
      alertGuestLiveRestricted();
      return;
    }
    navigation.navigate('Live', {
      screen: 'LiveRoom',
      params: { streamId },
    });
  };

  const goMarketplace = () => {
    navigation.navigate('Marketplace');
  };

  const openProduct = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const sellerEventForBanner = useMemo((): ScheduledStream | null => {
    if (!sellerNextRoom?.scheduledStartAt) return null;
    return {
      id: sellerNextRoom.id,
      title: sellerNextRoom.title,
      startsAt: sellerNextRoom.scheduledStartAt,
      host: {
        id: sellerNextRoom.sellerUsername,
        name: sellerNextRoom.sellerUsername,
        handle: `@${sellerNextRoom.sellerUsername}`,
        avatarUrl: `https://i.pravatar.cc/120?u=${encodeURIComponent(sellerNextRoom.sellerUsername)}`,
        verified: true,
        followers: '—',
      },
      category: 'cards',
      interestedCount: 0,
      cardGradient: ['#1a1208', '#0a0a0c'],
      eventTag: 'Your vault event',
    };
  }, [sellerNextRoom]);

  const showLiveSkeleton = initialLoad && liveRows.length === 0;
  const showLiveEmpty = !initialLoad && liveRows.length === 0;
  const showMarketplaceSkeleton = initialLoad && listings.length === 0;
  const showMarketplaceEmpty = !initialLoad && listings.length === 0;

  const liveSyncHint = refreshing && liveRows.length > 0 ? 'Syncing live rooms…' : null;
  const marketSyncHint = refreshing && listings.length > 0 ? 'Syncing the vault…' : null;
  const liveBootHint = showLiveSkeleton ? 'Loading live rooms…' : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.brandRow}>
          <View style={styles.brandTextCol}>
            <BrandLogo width={210} accessibilityLabel="Get Vaulted" />
          </View>
          <View style={styles.headerActions}>
            {activeBuyerOrders > 0 ? (
              <Pressable
                style={styles.ordersShortcut}
                onPress={() => openMyOrders(navigation)}
                accessibilityLabel="My orders"
              >
                <Ionicons name="receipt-outline" size={18} color={colors.gold} />
                <Text style={styles.ordersShortcutText}>Orders</Text>
                <View style={styles.ordersBadge}>
                  <Text style={styles.ordersBadgeText}>{activeBuyerOrders}</Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable style={styles.bell} onPress={() => openNotificationInbox(navigation)}>
              <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
              <NotificationBadge count={notificationCount} />
            </Pressable>
            <Pressable style={styles.bell} onPress={() => openMessagesInbox(navigation)}>
              <Ionicons name="chatbubbles-outline" size={22} color={colors.textPrimary} />
            </Pressable>
            {user ? (
              <>
                <Pressable
                  style={styles.bell}
                  onPress={() => openSettings(navigation)}
                  accessibilityLabel="Account settings"
                >
                  <Ionicons name="person-circle-outline" size={24} color={colors.textPrimary} />
                </Pressable>
                <Pressable
                  style={styles.bell}
                  onPress={() => confirmAndSignOut(signOut)}
                  accessibilityLabel="Sign out"
                >
                  <Ionicons name="log-out-outline" size={22} color={colors.live} />
                </Pressable>
              </>
            ) : null}
          </View>
        </View>

        <SearchBar
          placeholder="Search live rooms, sellers, grails…"
          onPress={() => openHelpCenter(navigation, true)}
        />

        <HomeCultureHero onLiveHub={goLive} onVault={goMarketplace} />

        <HomeSellerOnboardingStrip
          hasUser={Boolean(user)}
          connect={sellerConnect.status}
          onPress={onSellerOnboarding}
        />

        {sellerApproved ? (
          <HomeSellerEventBanner
            event={sellerEventForBanner}
            onOpenCommandCenter={() => {
              if (sellerNextRoom) openSellerHostRoom(navigation, sellerNextRoom.id);
              else openSellerHQ(navigation, { tab: 'live' });
            }}
          />
        ) : null}

        <SectionHeader title="Live now" actionLabel="See all" onPressAction={goLive} />
        {liveBootHint ? <HomeFeedSyncHint message={liveBootHint} /> : null}
        {liveSyncHint ? <HomeFeedSyncHint message={liveSyncHint} /> : null}
        <View style={styles.liveRailSlot}>
          {showLiveSkeleton ? (
            <LiveRoomCardSkeletonRail count={5} />
          ) : liveRows.length ? (
            <FlatList
              horizontal
              data={liveRows}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.liveRail}
              snapToInterval={LIVE_ROOM_CARD_SNAP}
              snapToAlignment="start"
              decelerationRate="fast"
              renderItem={({ item }) => (
                <LiveNowPreviewCard stream={item} onPress={() => openLiveShow(item.id)} />
              )}
            />
          ) : showLiveEmpty ? (
            <LiveEmptyBroadcastBlock
              useDefaultTabActions={false}
              primaryLabel="Explore live hub"
              secondaryLabel="Browse marketplace"
              onStartLive={goLive}
              onExploreListings={goMarketplace}
            />
          ) : null}
        </View>

        <SectionHeader title="The vault" actionLabel="Marketplace" onPressAction={goMarketplace} />
        {marketSyncHint ? <HomeFeedSyncHint message={marketSyncHint} /> : null}
        <View style={styles.marketRailSlot}>
          {showMarketplaceSkeleton ? (
            <MarketplaceCardSkeletonRail count={4} />
          ) : showMarketplaceEmpty ? (
            <PremiumEmptyPanel
              icon="storefront-outline"
              title="No listings in the vault yet."
              subtitle="List authenticated inventory to appear in discovery — buy-now, offers, and auctions."
              actions={[
                {
                  label: 'Create first listing',
                  onPress: () => void openCreateListing(navigation, { channel: 'marketplace' }),
                },
                { label: 'Browse marketplace', onPress: goMarketplace, variant: 'secondary' },
              ]}
            />
          ) : (
            <FlatList
              horizontal
              data={listings}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              renderItem={({ item }) => (
                <ProductCard product={item} onPress={() => openProduct(item)} variant="rail" marketplaceMeta />
              )}
            />
          )}
        </View>

        <SectionHeader title="Upcoming vault events" actionLabel="Live hub" onPressAction={goLive} />
        {scheduledRows.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {scheduledRows.map((s) => (
              <VaultDropCard key={s.id} event={s} onRemind={() => {}} onPress={() => openLiveShow(s.id)} />
            ))}
          </ScrollView>
        ) : (
          <PremiumEmptyPanel
            icon="calendar-outline"
            title="Drops incoming"
            subtitle="Vault events surface here as sellers lock dates — live drops and auctions incoming."
            actions={[{ label: 'Explore live hub', onPress: goLive }]}
          />
        )}

        {clips.length ? (
          <>
            <SectionHeader title="Hit clips" actionLabel="Live" onPressAction={goLive} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {clips.map((clip) => (
                <HotClipCard key={clip.id} clip={clip} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    paddingBottom: 120,
  },
  liveRailSlot: {
    minHeight: LIVE_ROOM_CARD_TOTAL_HEIGHT,
  },
  marketRailSlot: {
    minHeight: MARKETPLACE_RAIL_CARD_HEIGHT,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  brandTextCol: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.md,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ordersShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  ordersShortcutText: { fontSize: 12, fontWeight: '800', color: colors.gold },
  ordersBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  ordersBadgeText: { fontSize: 10, fontWeight: '900', color: '#0a0a0a' },
  bell: {
    padding: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    position: 'relative',
  },
  hList: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  liveRail: {
    paddingRight: spacing.lg,
  },
});
