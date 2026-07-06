import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { fetchMyLiveRooms, type LiveRoomApiRow } from '../api/liveRoomsRepository';
import { fetchSellerFollowStatus, toggleSellerFollow } from '../api/sellerFollowRepository';
import { FeaturedCreatorCard } from '../components/home/FeaturedCreatorCard';
import { HomeCommunityPulse } from '../components/home/HomeCommunityPulse';
import { HomeCompactHeader } from '../components/home/HomeCompactHeader';
import { HomeDiscoveryStrip } from '../components/home/HomeDiscoveryStrip';
import {
  HomeFeaturedLiveCard,
  HomeLiveHeroSkeleton,
} from '../components/home/HomeFeaturedLiveCard';
import { HomeFindYourNextGrailCard } from '../components/home/HomeFindYourNextGrailCard';
import {
  HOME_HOT_VAULT_CARD_HEIGHT,
  HOME_HOT_VAULT_CARD_WIDTH,
  HomeHotVaultCard,
} from '../components/home/HomeHotVaultCard';
import { HomeLiveDealsRail } from '../components/home/HomeLiveDealsRail';
import { HomeNeverMissDropSection } from '../components/home/HomeNeverMissDropSection';
import { HomeSectionHeader } from '../components/home/HomeSectionHeader';
import { HomeSellerEventBanner } from '../components/home/HomeSellerEventBanner';
import { HomeSellerOnboardingStrip } from '../components/home/HomeSellerOnboardingStrip';
import { HomeStartingSoonLane } from '../components/home/HomeStartingSoonLane';
import {
  LIVE_ROOM_CARD_SNAP,
  LiveNowPreviewCard,
} from '../components/home/LiveNowPreviewCard';
import { MarketplaceCardSkeletonRail } from '../components/home/MarketplaceCardSkeleton';
import { SearchBar } from '../components/ui/SearchBar';
import { VaultCampaignHeader } from '../components/branding/VaultCampaignHeader';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';
import {
  deriveFreshInVault,
  deriveHomeCommunityPulse,
  deriveHomeDiscoveryLanes,
  deriveHotVaultListings,
  deriveLiveDeals,
  deriveLiveHeroStreams,
  deriveUpcomingHeroEvents,
  deriveVerifiedSellers,
} from '../lib/homeFeedDerivations';
import {
  markLiveDiscoveryFetchAttempt,
  markLiveDiscoveryFetchResult,
  shouldThrottleLiveDiscoveryFetch,
} from '../lib/liveDiscoveryFetchPolicy';
import { filterDisplayableMarketplaceProducts, productIdSet } from '../lib/marketplaceListingQuality';
import { useLiveDiscoverySync } from '../hooks/useLiveDiscoverySync';
import { useLiveEventReminders } from '../hooks/useLiveEventReminders';
import { useMarketplaceLayout } from '../hooks/useMarketplaceLayout';
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
import { colors, spacing } from '../theme';
import type { FeaturedCreator, LiveStream, Product, ScheduledStream } from '../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

const HOT_VAULT_SNAP = HOME_HOT_VAULT_CARD_WIDTH + spacing.sm;

function sanitizeListings(listings: Product[]): Product[] {
  return filterDisplayableMarketplaceProducts(listings);
}

function initialFeedState() {
  const snapshot = getHomeFeedMemorySnapshot();
  const listings = sanitizeListings(snapshot?.listings ?? []);
  return {
    liveRows: snapshot?.live ?? [],
    scheduledRows: snapshot?.scheduled ?? [],
    listings,
    hasCache: Boolean(snapshot?.live.length || listings.length),
  };
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const layout = useMarketplaceLayout();
  const navigation = useNavigation<Nav>();
  const { user, guestExploreMode, session } = useAuth();
  const { count: notificationCount } = useNotificationBadge(user?.id);
  const sellerSetup = useSellerSetupState(session?.access_token, user?.id, Boolean(user?.id));
  const { remind, isReminderSet } = useLiveEventReminders();
  const creatorsSectionY = useRef(0);

  const seed = useMemo(() => initialFeedState(), []);
  const [initialLoad, setInitialLoad] = useState(!seed.hasCache);
  const [listings, setListings] = useState<Product[]>(seed.listings);
  const [liveRows, setLiveRows] = useState<LiveStream[]>(seed.liveRows);
  const [scheduledRows, setScheduledRows] = useState<ScheduledStream[]>(seed.scheduledRows);
  const [sellerNextRoom, setSellerNextRoom] = useState<LiveRoomApiRow | null>(null);
  const [activeBuyerOrders, setActiveBuyerOrders] = useState(0);
  const [followBySeller, setFollowBySeller] = useState<Record<string, boolean>>({});
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const sellerActivated = sellerSetup.displayActivated;
  const showSellerOnboarding = Boolean(user) && sellerSetup.phase === 'partial' && !sellerActivated;

  const liveHeroStreams = useMemo(() => deriveLiveHeroStreams(liveRows), [liveRows]);
  const featuredLive = liveHeroStreams[0] ?? null;
  const secondaryLiveRows = useMemo(() => liveHeroStreams.slice(1), [liveHeroStreams]);
  const upcomingHeroEvents = useMemo(() => deriveUpcomingHeroEvents(scheduledRows), [scheduledRows]);
  const trendingInVault = useMemo(() => deriveHotVaultListings(listings).slice(0, 10), [listings]);
  const trendingIds = useMemo(() => productIdSet(trendingInVault), [trendingInVault]);
  const verifiedSellers = useMemo(
    () => deriveVerifiedSellers(liveRows, scheduledRows),
    [liveRows, scheduledRows],
  );
  const discoveryLanes = useMemo(
    () => deriveHomeDiscoveryLanes(liveRows, scheduledRows, listings, verifiedSellers),
    [liveRows, scheduledRows, listings, verifiedSellers],
  );
  const liveDeals = useMemo(() => deriveLiveDeals(liveRows), [liveRows]);
  const communityPulse = useMemo(
    () => deriveHomeCommunityPulse(liveRows, scheduledRows, listings, verifiedSellers),
    [liveRows, scheduledRows, listings, verifiedSellers],
  );
  const followedSellerIds = useMemo(
    () => Object.entries(followBySeller).filter(([, following]) => following).map(([id]) => id),
    [followBySeller],
  );
  const freshInVault = useMemo(
    () => deriveFreshInVault(listings, followedSellerIds, trendingIds),
    [listings, followedSellerIds, trendingIds],
  );
  const hasPersonalizedPicks = followedSellerIds.length > 0;
  const freshSectionTitle = hasPersonalizedPicks ? 'Picked for Your Vault' : 'Fresh in the Vault';
  const freshSectionSubtitle = hasPersonalizedPicks
    ? 'New inventory from sellers you follow'
    : 'Authenticated listings across the vault';

  const startingSoonIsHero = !featuredLive && upcomingHeroEvents.length > 0;
  const showFeaturedSkeleton = initialLoad && !featuredLive && upcomingHeroEvents.length === 0;
  const showFindGrail = !initialLoad && !featuredLive && upcomingHeroEvents.length === 0;
  const showUpNextSection = Boolean(featuredLive && upcomingHeroEvents.length);
  const showNeverMissDrop =
    !communityPulse.length && !showUpNextSection && !startingSoonIsHero && !showFindGrail;

  useEffect(() => {
    if (!user?.id) {
      setActiveBuyerOrders(0);
      return;
    }
    const task = deferAfterFirstPaint(() => {
      void countActiveBuyerOrders(user.id, session?.access_token).then(setActiveBuyerOrders);
    }, 1200);
    return () => task.cancel();
  }, [session?.access_token, user?.id]);

  const loadFeed = useCallback(async (opts?: { hadCachedLive?: boolean; hadCachedListings?: boolean; force?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setSellerNextRoom(null);
      setInitialLoad(false);
      return;
    }

    const force = Boolean(opts?.force);
    const skipDiscovery = shouldThrottleLiveDiscoveryFetch({ force });

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
        } else {
          markLiveDiscoveryFetchResult(false, livePack.meta.error);
        }
      }

      setListings(sanitizeListings(products));

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
          if (cache.listings.length) setListings(sanitizeListings(cache.listings));
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

  const handleDiscoveryLane = (laneId: string) => {
    if (laneId === 'marketplace' || laneId === 'under50' || laneId === 'ending') {
      goMarketplace();
      return;
    }
    if (laneId === 'sellers') {
      if (creatorsSectionY.current > 0) {
        scrollRef.current?.scrollTo({ y: creatorsSectionY.current, animated: true });
      } else {
        goLive();
      }
      return;
    }
    goLive();
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

  const showTrendingSkeleton = initialLoad && trendingInVault.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <LinearGradient
        colors={['rgba(212,175,55,0.07)', 'rgba(255,59,48,0.04)', 'transparent']}
        style={styles.topGlow}
        pointerEvents="none"
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.scroll, { paddingBottom: layout.tabBarClearance }]}
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
          placeholder="Search live, the vault, sellers, collections…"
          onPress={() => openVaultSearch(navigation)}
        />

        <VaultCampaignHeader />

        <HomeSectionHeader first eyebrow="Discover" title="Jump in fast">
          <HomeDiscoveryStrip lanes={discoveryLanes} onPressLane={handleDiscoveryLane} />
        </HomeSectionHeader>

        {featuredLive ? (
          <HomeSectionHeader eyebrow="Live now" title="Watch live" actionLabel="Live hub" onAction={goLive}>
            <HomeFeaturedLiveCard stream={featuredLive} onPress={() => openLiveShow(featuredLive.id)} />
          </HomeSectionHeader>
        ) : showFeaturedSkeleton ? (
          <View style={styles.heroSlot}>
            <HomeLiveHeroSkeleton />
          </View>
        ) : startingSoonIsHero ? (
          <HomeSectionHeader eyebrow="Starting soon" title="Next live drops" actionLabel="See all" onAction={goLive}>
            <HomeStartingSoonLane
              events={upcomingHeroEvents.slice(0, 8)}
              reminderSetFor={isReminderSet}
              onOpenEvent={openLiveShow}
              onRemind={handleEventRemind}
            />
          </HomeSectionHeader>
        ) : showFindGrail ? (
          <HomeSectionHeader eyebrow="The vault" title="Find Your Next Grail">
            <HomeFindYourNextGrailCard onExploreLive={goLive} onShopTheVault={goMarketplace} />
          </HomeSectionHeader>
        ) : null}

        {secondaryLiveRows.length ? (
          <View style={styles.secondaryLiveBlock}>
            <FlatList
              horizontal
              data={secondaryLiveRows}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              snapToInterval={LIVE_ROOM_CARD_SNAP}
              decelerationRate="fast"
              renderItem={({ item }) => (
                <LiveNowPreviewCard stream={item} onPress={() => openLiveShow(item.id)} />
              )}
            />
          </View>
        ) : null}

        {showUpNextSection ? (
          <HomeSectionHeader eyebrow="Up next" title="Starting soon" actionLabel="Calendar" onAction={goLive}>
            <HomeStartingSoonLane
              events={upcomingHeroEvents.slice(0, 6)}
              reminderSetFor={isReminderSet}
              onOpenEvent={openLiveShow}
              onRemind={handleEventRemind}
            />
          </HomeSectionHeader>
        ) : null}

        {showTrendingSkeleton ? (
          <HomeSectionHeader eyebrow="The vault" title="Trending in the Vault">
            <View style={styles.hotVaultSlot}>
              <MarketplaceCardSkeletonRail count={4} />
            </View>
          </HomeSectionHeader>
        ) : trendingInVault.length ? (
          <HomeSectionHeader
            eyebrow="The vault"
            title="Trending in the Vault"
            actionLabel="See all"
            onAction={goMarketplace}
          >
            <View style={styles.hotVaultSlot}>
              <FlatList
                horizontal
                data={trendingInVault}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hList}
                snapToInterval={HOT_VAULT_SNAP}
                decelerationRate="fast"
                renderItem={({ item }) => (
                  <HomeHotVaultCard product={item} onPress={() => openProduct(item)} />
                )}
              />
            </View>
          </HomeSectionHeader>
        ) : null}

        {liveDeals.length ? (
          <HomeSectionHeader eyebrow="Live floor" title="Auction heat" actionLabel="Live hub" onAction={goLive}>
            <HomeLiveDealsRail deals={liveDeals} onOpenStream={openLiveShow} />
          </HomeSectionHeader>
        ) : null}

        {communityPulse.length ? (
          <HomeSectionHeader eyebrow="Community" title="Vault activity">
            <HomeCommunityPulse items={communityPulse} />
          </HomeSectionHeader>
        ) : showNeverMissDrop ? (
          <HomeSectionHeader eyebrow="Stay ready" title="Never Miss a Drop">
            <HomeNeverMissDropSection onExploreLive={goLive} />
          </HomeSectionHeader>
        ) : null}

        {freshInVault.length ? (
          <HomeSectionHeader
            eyebrow="For you"
            title={freshSectionTitle}
            subtitle={freshSectionSubtitle}
            actionLabel="Shop the Vault"
            onAction={goMarketplace}
          >
            <FlatList
              horizontal
              data={freshInVault}
              keyExtractor={(item) => `fresh-${item.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hList}
              snapToInterval={HOT_VAULT_SNAP}
              decelerationRate="fast"
              renderItem={({ item }) => (
                <HomeHotVaultCard product={item} onPress={() => openProduct(item)} />
              )}
            />
          </HomeSectionHeader>
        ) : null}

        {verifiedSellers.length ? (
          <View
            onLayout={(event) => {
              creatorsSectionY.current = event.nativeEvent.layout.y;
            }}
          >
            <HomeSectionHeader eyebrow="Verified hosts" title="Trending sellers" actionLabel="Live hub" onAction={goLive}>
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
            </HomeSectionHeader>
          </View>
        ) : null}

        {showSellerOnboarding ? (
          <View style={styles.bottomBanner}>
            <HomeSellerOnboardingStrip
              hasUser={Boolean(user)}
              phase={sellerSetup.phase}
              onPress={onSellerOnboarding}
            />
          </View>
        ) : null}

        {sellerActivated ? (
          <View style={styles.bottomBanner}>
            <HomeSellerEventBanner
              event={sellerEventForBanner}
              onOpenCommandCenter={() => {
                if (sellerNextRoom) openSellerHostRoom(navigation, sellerNextRoom.id);
                else openSellerHQ(navigation, { tab: 'live' });
              }}
            />
          </View>
        ) : null}
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
    height: 280,
  },
  scroll: {
    flexGrow: 1,
  },
  heroSlot: {
    marginTop: spacing.md,
  },
  secondaryLiveBlock: {
    marginTop: spacing.sm,
  },
  hotVaultSlot: {
    minHeight: HOME_HOT_VAULT_CARD_HEIGHT,
  },
  hList: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  sellerRail: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
  bottomBanner: {
    marginTop: spacing.lg,
  },
});
