import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../api/liveRoomsRepository';
import { fetchSellerFollowStatus, toggleSellerFollow } from '../api/sellerFollowRepository';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { FeaturedCreatorCard } from '../components/home/FeaturedCreatorCard';
import { HomeCompactHeader } from '../components/home/HomeCompactHeader';
import { HomeCultureHero } from '../components/home/HomeCultureHero';
import { HomeFeaturedLiveHero } from '../components/home/HomeFeaturedLiveHero';
import { HomeFeedSection } from '../components/home/HomeFeedSection';
import { HomeFeedSyncHint } from '../components/home/HomeFeedSyncHint';
import { HomeLiveActivityStrip } from '../components/home/HomeLiveActivityStrip';
import { HomeRecentSalesRail } from '../components/home/HomeRecentSalesRail';
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
import { MomentumStrip } from '../components/home/MomentumStrip';
import { VaultDropCard } from '../components/home/VaultDropCard';
import { ProductCard } from '../components/ui/ProductCard';
import { SearchBar } from '../components/ui/SearchBar';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import {
  deriveLiveActivityPulse,
  deriveTrendingSales,
  deriveVerifiedSellers,
  placeholderCommunitySales,
} from '../lib/homeFeedDerivations';
import { deriveHotClipsFromLive } from '../lib/hotClips';
import {
  markLiveDiscoveryFetchAttempt,
  markLiveDiscoveryFetchResult,
  shouldThrottleLiveDiscoveryFetch,
} from '../lib/liveDiscoveryFetchPolicy';
import { openCreateListing } from '../navigation/openCreateListing';
import { useLiveDiscoverySync } from '../hooks/useLiveDiscoverySync';
import { useLiveEventReminders } from '../hooks/useLiveEventReminders';
import {
  getHomeFeedMemorySnapshot,
  hasWarmHomeFeedCache,
  loadHomeFeedCache,
  saveHomeFeedCache,
} from '../lib/homeFeedCache';
import { isSupabaseConfigured } from '../lib/supabase';
import { scheduledStreamReminderTarget } from '../lib/liveEventReminder';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { useAuth } from '../auth/AuthContext';
import { useSellerSetupState } from '../hooks/useSellerSetupState';
import { openMessagesInbox } from '../navigation/openMessages';
import { useNotificationBadge } from '../hooks/useNotificationBadge';
import {
  openVaultSearch,
  openMyOrders,
  openNotificationInbox,
  openSettings,
  openUserProfile,
} from '../navigation/openPlatform';
import { countActiveBuyerOrders } from '../api/ordersRepository';
import { openSellerHostRoom } from '../navigation/openSellerHostRoom';
import { openSellerHQ } from '../navigation/openSellerHQ';
import { openSellerSetup } from '../navigation/openSellerSetup';
import { navigateAuthSignUp } from '../navigation/rootNavigationRef';
import { colors, radii, spacing } from '../theme';
import type { FeaturedCreator, HotClip, LiveStream, Product, ScheduledStream } from '../types';

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
  const { user, guestExploreMode, session } = useAuth();
  const { count: notificationCount } = useNotificationBadge(user?.id);
  const sellerSetup = useSellerSetupState(session?.access_token, Boolean(user?.id));
  const { remind, isReminderSet } = useLiveEventReminders();
  const [followBySeller, setFollowBySeller] = useState<Record<string, boolean>>({});
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);

  const seed = useMemo(() => initialFeedState(), []);
  const [initialLoad, setInitialLoad] = useState(!seed.hasCache);
  const [refreshing, setRefreshing] = useState(false);
  const [listings, setListings] = useState<Product[]>(seed.listings);
  const [liveRows, setLiveRows] = useState<LiveStream[]>(seed.liveRows);
  const [scheduledRows, setScheduledRows] = useState<ScheduledStream[]>(seed.scheduledRows);
  const [clips, setClips] = useState<HotClip[]>([]);
  const [sellerNextRoom, setSellerNextRoom] = useState<LiveRoomApiRow | null>(null);
  const [activeBuyerOrders, setActiveBuyerOrders] = useState(0);

  const sellerActivated = sellerSetup.displayActivated;

  const featuredLive = liveRows[0] ?? null;
  const featuredUpcoming = scheduledRows[0] ?? null;
  const verifiedSellers = useMemo(
    () => deriveVerifiedSellers(liveRows, scheduledRows),
    [liveRows, scheduledRows],
  );
  const activityPulse = useMemo(() => deriveLiveActivityPulse(liveRows), [liveRows]);
  const communitySales = useMemo(() => {
    const trending = deriveTrendingSales(listings);
    return trending.length ? trending : placeholderCommunitySales();
  }, [listings]);

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

  const loadFeed = useCallback(async (opts?: { hadCachedLive?: boolean; hadCachedListings?: boolean; force?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setClips([]);
      setSellerNextRoom(null);
      setInitialLoad(false);
      setRefreshing(false);
      return;
    }

    const force = Boolean(opts?.force);
    const skipDiscovery = shouldThrottleLiveDiscoveryFetch({ force });

    if (opts?.hadCachedLive || opts?.hadCachedListings) setRefreshing(true);

    try {
      if (!skipDiscovery) markLiveDiscoveryFetchAttempt();

      const [products, livePack] = await Promise.all([
        fetchMarketplaceListings({ limit: 24 }),
        skipDiscovery
          ? Promise.resolve({
              live: [] as LiveStream[],
              scheduled: [] as ScheduledStream[],
              meta: { success: false, error: null, source: 'none' as const, fetchedAt: Date.now(), apiBaseUrl: null },
            })
          : fetchLiveShowsForDiscovery(),
      ]);

      if (!skipDiscovery) {
        if (livePack.meta.success) {
          markLiveDiscoveryFetchResult(true);
          setLiveRows(livePack.live);
          setScheduledRows(livePack.scheduled);
          setClips(deriveHotClipsFromLive(livePack.live));
        } else {
          markLiveDiscoveryFetchResult(false, livePack.meta.error);
        }
      }

      setListings(products);

      if (!skipDiscovery && livePack.meta.success) {
        void saveHomeFeedCache({
          live: livePack.live,
          scheduled: livePack.scheduled,
          listings: products.length ? products : [],
        });
      } else if (products.length) {
        const prev = getHomeFeedMemorySnapshot();
        void saveHomeFeedCache({
          live: prev?.live ?? [],
          scheduled: prev?.scheduled ?? [],
          listings: products,
        });
      }
    } finally {
      setInitialLoad(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!sellerActivated || !session?.access_token) {
      setSellerNextRoom(null);
      return;
    }
    let cancelled = false;
    void fetchMyLiveRooms(session.access_token)
      .catch(() => [] as LiveRoomApiRow[])
      .then((myRooms) => {
        if (cancelled) return;
        const upcoming = myRooms
          .filter((r) => r.status === 'scheduled' && r.scheduledStartAt)
          .sort((a, b) => {
            const ta = new Date(a.scheduledStartAt!).getTime();
            const tb = new Date(b.scheduledStartAt!).getTime();
            return ta - tb;
          })[0];
        setSellerNextRoom(upcoming ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerActivated, session?.access_token]);

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
  }, [loadFeed]);

  useLiveDiscoverySync((opts) =>
    loadFeed({
      hadCachedLive: true,
      hadCachedListings: true,
      force: opts?.force,
    }),
  );

  const goLive = () => {
    navigation.navigate('Live', { screen: 'LiveDiscovery' });
  };

  const onSellerOnboarding = () => {
    if (!user) {
      navigateAuthSignUp();
      return;
    }
    openSellerSetup();
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

  useEffect(() => {
    if (!session?.access_token || verifiedSellers.length === 0) {
      setFollowBySeller({});
      return;
    }
    let cancelled = false;
    const task = deferAfterFirstPaint(() => {
      void (async () => {
        const next: Record<string, boolean> = {};
        await Promise.all(
          verifiedSellers.map(async (creator) => {
            const status = await fetchSellerFollowStatus(creator.host.id, session.access_token);
            if (status) next[creator.host.id] = status.following;
          }),
        );
        if (!cancelled) setFollowBySeller(next);
      })();
    }, 900);
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [session?.access_token, verifiedSellers]);

  const requireAuthForHomeAction = () => {
    if (guestExploreMode || !session?.access_token) {
      navigateAuthSignUp();
    }
  };

  const handleEventRemind = (event: ScheduledStream) => {
    void remind(scheduledStreamReminderTarget(event), requireAuthForHomeAction);
  };

  const handleFollowCreator = (creator: FeaturedCreator) => {
    if (!session?.access_token) {
      navigateAuthSignUp();
      return;
    }
    const sellerId = creator.host.id;
    const prev = followBySeller[sellerId] ?? false;
    setFollowBusyId(sellerId);
    setFollowBySeller((current) => ({ ...current, [sellerId]: !prev }));
    void toggleSellerFollow(sellerId, prev, session.access_token).then((result) => {
      setFollowBusyId(null);
      if (result.error) {
        setFollowBySeller((current) => ({ ...current, [sellerId]: prev }));
        Alert.alert('Follow', result.error);
        return;
      }
      setFollowBySeller((current) => ({ ...current, [sellerId]: result.following }));
    });
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
        avatarUrl: '',
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
    <View style={styles.screen}>
      <LinearGradient
        colors={['rgba(212,175,55,0.06)', 'transparent', 'transparent']}
        style={styles.topGlow}
        pointerEvents="none"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.sm }]}
      >
        <HomeCompactHeader
          notificationCount={notificationCount}
          activeBuyerOrders={activeBuyerOrders}
          signedIn={Boolean(user)}
          onOrders={() => openMyOrders(navigation)}
          onNotifications={() => openNotificationInbox(navigation)}
          onMessages={() => openMessagesInbox(navigation)}
          onProfile={() => openSettings(navigation)}
        />

        <SearchBar
          home
          placeholder="Search live rooms, sellers, grails…"
          onPress={() => openVaultSearch(navigation)}
        />

        <HomeCultureHero onLiveHub={goLive} onVault={goMarketplace} />

        <MomentumStrip
          liveCount={liveRows.length}
          listingCount={listings.length}
          scheduledCount={scheduledRows.length}
        />

        {sellerSetup.showSetupGate ? (
          <View style={styles.inlineBanner}>
            <HomeSellerOnboardingStrip
              hasUser={Boolean(user)}
              phase={sellerSetup.phase}
              onPress={onSellerOnboarding}
            />
          </View>
        ) : null}

        {sellerActivated ? (
          <View style={styles.inlineBanner}>
            <HomeSellerEventBanner
              event={sellerEventForBanner}
              onOpenCommandCenter={() => {
                if (sellerNextRoom) openSellerHostRoom(navigation, sellerNextRoom.id);
                else openSellerHQ(navigation, { tab: 'live' });
              }}
            />
          </View>
        ) : null}

        <HomeFeedSection
          first
          eyebrow="Spotlight"
          title="Featured"
          actionLabel="Live hub"
          onAction={goLive}
        >
          <HomeFeaturedLiveHero
            liveStream={featuredLive}
            upcomingEvent={featuredUpcoming}
            onPressLive={() => featuredLive && openLiveShow(featuredLive.id)}
            onPressUpcoming={() => featuredUpcoming && openLiveShow(featuredUpcoming.id)}
            onPressRemind={
              featuredUpcoming ? () => handleEventRemind(featuredUpcoming) : undefined
            }
            reminderSet={featuredUpcoming ? isReminderSet(featuredUpcoming.id) : false}
            onPressExplore={goLive}
          />
        </HomeFeedSection>

        <HomeFeedSection eyebrow="Now streaming" title="Live now" actionLabel="See all" onAction={goLive}>
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
                renderItem={({ item, index }) => (
                  <LiveNowPreviewCard
                    stream={item}
                    onPress={() => openLiveShow(item.id)}
                    promoBadge={index === 0 ? 'FEATURED' : index === 1 ? 'TRENDING' : undefined}
                  />
                )}
              />
            ) : showLiveEmpty ? (
              <PremiumEmptyPanel
                icon="radio-outline"
                kicker="Live floor"
                title="The live floor opens soon"
                subtitle="Join vault events, breaks, and auctions the moment sellers go live."
                actions={[
                  { label: 'Enter live', onPress: goLive },
                  { label: 'Browse vault', onPress: goMarketplace, variant: 'secondary' },
                ]}
              />
            ) : null}
          </View>
        </HomeFeedSection>

        <HomeFeedSection
          eyebrow="Trending this week"
          title="Vault inventory"
          actionLabel="Marketplace"
          onAction={goMarketplace}
        >
          {marketSyncHint ? <HomeFeedSyncHint message={marketSyncHint} /> : null}
          <View style={styles.marketRailSlot}>
            {showMarketplaceSkeleton ? (
              <MarketplaceCardSkeletonRail count={4} />
            ) : showMarketplaceEmpty ? (
              <PremiumEmptyPanel
                icon="diamond-outline"
                kicker="Vault marketplace"
                title="Ready to make your first vault listing?"
                subtitle="Reach collectors with verified inventory, buy-now listings, offers, and live auctions."
                actions={[
                  {
                    label: 'Create listing',
                    onPress: () => void openCreateListing(navigation, { channel: 'marketplace' }),
                  },
                  { label: 'Browse vault', onPress: goMarketplace, variant: 'secondary' },
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
        </HomeFeedSection>

        <HomeFeedSection eyebrow="Upcoming drops" title="Vault events" actionLabel="See all" onAction={goLive}>
          {scheduledRows.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {scheduledRows.map((s) => (
                <VaultDropCard
                  key={s.id}
                  event={s}
                  onRemind={() => handleEventRemind(s)}
                  reminderSet={isReminderSet(s.id)}
                  onPress={() => openLiveShow(s.id)}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.upcomingPlaceholder}>
              <Ionicons name="calendar-outline" size={22} color="rgba(212,175,55,0.7)" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.upcomingTitle}>Drops are being scheduled</Text>
                <Text style={styles.upcomingSub}>
                  Vault events surface here as sellers lock dates for live breaks and auctions.
                </Text>
              </View>
              <Pressable style={styles.upcomingCta} onPress={goLive}>
                <Text style={styles.upcomingCtaTxt}>Explore</Text>
              </Pressable>
            </View>
          )}
        </HomeFeedSection>

        <HomeFeedSection eyebrow="Vault verified" title="Top sellers" actionLabel="Live hub" onAction={goLive}>
          {verifiedSellers.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sellerRail}>
              {verifiedSellers.map((creator) => (
                <FeaturedCreatorCard
                  key={creator.host.id}
                  creator={creator}
                  following={followBySeller[creator.host.id] ?? false}
                  followBusy={followBusyId === creator.host.id}
                  onFollow={() => handleFollowCreator(creator)}
                  onPress={() => openUserProfile(creator.host.id, navigation)}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.upcomingPlaceholder}>
              <Ionicons name="shield-checkmark-outline" size={22} color="rgba(212,175,55,0.7)" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.upcomingTitle}>Verified sellers go live here</Text>
                <Text style={styles.upcomingSub}>
                  Follow breakout hosts, breakers, and vault shops as they hit the live floor.
                </Text>
              </View>
            </View>
          )}
        </HomeFeedSection>

        <HomeFeedSection eyebrow="Community pulse" title="Collector activity">
          <HomeLiveActivityStrip items={activityPulse} />
        </HomeFeedSection>

        <HomeFeedSection eyebrow="Market heat" title="Recently sold & trending" actionLabel="Vault" onAction={goMarketplace}>
          <HomeRecentSalesRail sales={communitySales} />
        </HomeFeedSection>

        {clips.length ? (
          <HomeFeedSection eyebrow="Highlights" title="Hit clips" actionLabel="Live" onAction={goLive}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {clips.map((clip) => (
                <HotClipCard key={clip.id} clip={clip} onOpen={openLiveShow} />
              ))}
            </ScrollView>
          </HomeFeedSection>
        ) : null}

        <View style={{ height: spacing.xxl }} />
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
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
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
  inlineBanner: {
    marginTop: spacing.sm,
  },
  hList: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  liveRail: {
    paddingRight: spacing.lg,
  },
  sellerRail: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  upcomingPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  upcomingSub: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    fontWeight: '500',
  },
  upcomingCta: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
  },
  upcomingCtaTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
  },
});
