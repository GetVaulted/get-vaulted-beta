import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMarketplaceListingsPage } from '../api/listingsFeedRepository';
import { touchAuctionPaymentExpiries } from '../api/touchAuctionPaymentExpiries';
import { useAuth } from '../auth/AuthContext';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { MarketplaceChips } from '../components/marketplace/MarketplaceChips';
import { MarketplaceShelf } from '../components/marketplace/MarketplaceShelf';
import { MarketplaceSortSheet } from '../components/marketplace/MarketplaceSortSheet';
import { MarketplaceTile } from '../components/marketplace/MarketplaceTile';
import { SearchBar } from '../components/ui/SearchBar';
import { useMarketplaceCatalogSync } from '../hooks/useMarketplaceCatalogSync';
import { useMarketplaceLayout } from '../hooks/useMarketplaceLayout';
import { useMarketplaceShelves } from '../hooks/useMarketplaceShelves';
import { hasWarmHomeFeedCache, getHomeFeedMemorySnapshot } from '../lib/homeFeedCache';
import { marketplaceChipCategory, MARKETPLACE_CHIPS, type MarketplaceChipId } from '../lib/marketplaceChips';
import { marketplaceSortLabel, type MarketplaceSortValue } from '../lib/marketplaceSort';
import { recordRecentlyViewed } from '../lib/recentlyViewed';
import { computeMarketplaceGrid, marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../lib/marketplaceUiScale';
import { isSupabaseConfigured } from '../lib/supabase';
import { openCreateListing } from '../navigation/openCreateListing';
import { openVaultSearch } from '../navigation/openPlatform';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';
import type { Product } from '../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

const PAGE_SIZE = 60;

export function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const layout = useMarketplaceLayout();
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { recents, favorites, savedIds, toggleSaved } = useMarketplaceShelves();

  const [chip, setChip] = useState<MarketplaceChipId>('all');
  const [sort, setSort] = useState<MarketplaceSortValue>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>(() => getHomeFeedMemorySnapshot()?.listings ?? []);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const loadedOnceRef = useRef(Boolean(getHomeFeedMemorySnapshot()?.listings.length));
  // Page cursor for `GET /api/listings?scope=published`. Category and sort are applied by the
  // server, so a chip shows every matching listing — not just the ones already on the phone.
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  // Bumped on every chip/sort change so a slow response for an old filter can't overwrite a newer one.
  const requestRef = useRef(0);

  const category = marketplaceChipCategory(chip);
  const filtered = chip !== 'all' || sort !== 'recent';

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isSupabaseConfigured()) {
        setCatalog([]);
        setLoading(false);
        loadedOnceRef.current = true;
        return;
      }
      const request = ++requestRef.current;
      const silent = opts?.silent ?? loadedOnceRef.current;
      if (!silent) setLoading(true);
      try {
        const result = await fetchMarketplaceListingsPage({ page: 1, pageSize: PAGE_SIZE, category, sort });
        if (request !== requestRef.current) return;
        setCatalog(result.products);
        setTotalCount(result.totalListingCount);
        setFilteredCount(result.filteredListingCount);
        pageRef.current = 1;
        hasMoreRef.current = result.hasMore;
      } finally {
        if (request === requestRef.current) {
          loadedOnceRef.current = true;
          setLoading(false);
        }
      }
    },
    [category, sort],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMoreRef.current || !isSupabaseConfigured()) return;
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const result = await fetchMarketplaceListingsPage({ page: nextPage, pageSize: PAGE_SIZE, category, sort });
      if (request !== requestRef.current) return;
      pageRef.current = result.page;
      hasMoreRef.current = result.hasMore;
      setCatalog((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const additions = result.products.filter((p) => !seen.has(p.id));
        return additions.length ? [...prev, ...additions] : prev;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, category, sort]);

  // Reload whenever the chip or sort changes (and once on mount). Clearing first means the new
  // filter never briefly shows the previous filter's listings.
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
    } else {
      setCatalog([]);
      loadedOnceRef.current = false;
    }
    void load();
  }, [load]);

  useMarketplaceCatalogSync(() => load({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      void touchAuctionPaymentExpiries(session?.access_token);
      if (!filtered && !hasWarmHomeFeedCache()) {
        void load({ silent: loadedOnceRef.current });
      }
    }, [filtered, load, session?.access_token]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const openProduct = useCallback(
    (product: Product) => {
      void recordRecentlyViewed(userId, product.id);
      navigation.navigate('ProductDetail', { productId: product.id });
    },
    [navigation, userId],
  );

  const grid = useMemo(() => computeMarketplaceGrid(layout.contentWidth), [layout.contentWidth]);

  const hasListings = catalog.length > 0;
  const showBlockingSkeleton = loading && !hasListings;
  const showEmpty = !showBlockingSkeleton && !hasListings;
  const showShelves = chip === 'all' && sort === 'recent' && !showBlockingSkeleton;
  const chipLabel = MARKETPLACE_CHIPS.find((c) => c.id === chip)?.label ?? 'All';
  const resultCount = filteredCount ?? catalog.length;

  const renderItem = useCallback(
    ({ item, index }: { item: Product; index: number }) => (
      <MarketplaceTile
        product={item}
        width={grid.cardWidth}
        scale={layout.scale}
        saved={savedIds.has(item.id)}
        onPress={() => openProduct(item)}
        onToggleSave={() => void toggleSaved(item)}
        imagePriority={index < grid.cols * 2 ? 'high' : 'normal'}
      />
    ),
    [grid.cardWidth, grid.cols, layout.scale, openProduct, savedIds, toggleSaved],
  );

  const titleSize = marketplaceFontSize(layout.compact ? 28 : 32, layout.scale);

  const listHeader = (
    <View style={styles.header}>
      <View accessibilityRole="header" style={styles.titleBlock}>
        <Text style={[styles.title, { fontSize: titleSize, lineHeight: titleSize + 4 }]} {...MARKETPLACE_TEXT_PROPS}>
          Marketplace
        </Text>
        {totalCount != null ? (
          <Text style={styles.subtitle} {...MARKETPLACE_TEXT_PROPS}>
            {totalCount.toLocaleString('en-US')} {totalCount === 1 ? 'listing' : 'listings'}
          </Text>
        ) : null}
      </View>

      <SearchBar
        placeholder="Search helmets, cards, boxes, players"
        onPress={() => openVaultSearch(navigation)}
        compact={layout.compact}
      />

      <MarketplaceChips active={chip} onChange={setChip} bleed={layout.horizontalPadding} />

      <View style={styles.utility}>
        <Pressable
          onPress={() => setSortOpen(true)}
          style={styles.sortBtn}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${marketplaceSortLabel(sort)}`}
        >
          <Text style={styles.sortTxt} {...MARKETPLACE_TEXT_PROPS}>
            {marketplaceSortLabel(sort)}
          </Text>
          <Ionicons name="chevron-down" size={13} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.count} {...MARKETPLACE_TEXT_PROPS}>
          {showBlockingSkeleton ? '' : `${resultCount.toLocaleString('en-US')} ${resultCount === 1 ? 'result' : 'results'}`}
        </Text>
      </View>

      {showShelves ? (
        <>
          <MarketplaceShelf
            title="Recently viewed"
            products={recents}
            savedIds={savedIds}
            scale={layout.scale}
            bleed={layout.horizontalPadding}
            onOpen={openProduct}
            onToggleSave={(p) => void toggleSaved(p)}
          />
          <MarketplaceShelf
            title="Your favorites"
            products={favorites}
            savedIds={savedIds}
            scale={layout.scale}
            bleed={layout.horizontalPadding}
            onOpen={openProduct}
            onToggleSave={(p) => void toggleSaved(p)}
            onSeeAll={() => navigation.navigate('Watchlist')}
          />
        </>
      ) : null}

      {hasListings ? (
        <View style={styles.gridHeading}>
          <Text style={[styles.sectionTitle, { fontSize: marketplaceFontSize(15, layout.scale) }]} accessibilityRole="header" {...MARKETPLACE_TEXT_PROPS}>
            {chip === 'all' ? 'All listings' : chipLabel}
          </Text>
        </View>
      ) : null}

      {showBlockingSkeleton ? (
        <View style={[styles.skeletonGrid, { gap: grid.gap }]}>
          {Array.from({ length: grid.cols * 3 }).map((_, i) => (
            <View key={i} style={{ width: grid.cardWidth }}>
              <View style={[styles.skeletonPhoto, { width: grid.cardWidth, height: grid.cardWidth }]} />
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            </View>
          ))}
        </View>
      ) : null}

      {showEmpty ? (
        chip === 'all' ? (
          <PremiumEmptyPanel
            icon="storefront-outline"
            kicker="The vault"
            title="No listings in the vault yet."
            subtitle="Be the first to list authenticated inventory — buy now with optional offers and trades."
            actions={[
              {
                label: 'Create first listing',
                onPress: () => void openCreateListing(navigation, { channel: 'marketplace' }),
              },
            ]}
          />
        ) : (
          <PremiumEmptyPanel
            icon="storefront-outline"
            kicker="The vault"
            title={`No ${chipLabel} listings right now.`}
            subtitle="Check back soon, or browse everything."
            actions={[{ label: 'Show all listings', onPress: () => setChip('all') }]}
          />
        )
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <FlatList
        data={hasListings ? catalog : []}
        key={`mkt-grid-${grid.cols}`}
        numColumns={grid.cols}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.gold} style={styles.loadMoreSpinner} />
          ) : null
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={1.2}
        columnWrapperStyle={{ gap: grid.gap, marginBottom: spacing.lg }}
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: layout.horizontalPadding,
            paddingBottom: layout.tabBarClearance,
          },
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={grid.cols * 4}
        maxToRenderPerBatch={grid.cols * 4}
        windowSize={9}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.gold} />
        }
      />
      <MarketplaceSortSheet visible={sortOpen} value={sort} onSelect={setSort} onClose={() => setSortOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    paddingTop: spacing.sm,
    flexGrow: 1,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  titleBlock: { gap: 2 },
  title: {
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  subtitle: { fontSize: 12, color: colors.textSecondary },
  utility: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sortBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.surface,
  },
  sortTxt: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  count: { fontSize: 12, color: colors.textSecondary },
  gridHeading: { marginTop: spacing.xs },
  sectionTitle: {
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  skeletonPhoto: { borderRadius: 10, backgroundColor: colors.surface },
  skeletonLine: { height: 10, borderRadius: 5, marginTop: 8, backgroundColor: colors.surface },
  skeletonLineShort: { width: '55%' },
  loadMoreSpinner: {
    marginVertical: spacing.lg,
  },
});
