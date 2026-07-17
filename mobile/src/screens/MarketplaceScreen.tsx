import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { touchAuctionPaymentExpiries } from '../api/touchAuctionPaymentExpiries';
import { useAuth } from '../auth/AuthContext';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { MarketplaceCategoryRail, type MarketplaceLaneId } from '../components/discover/DiscoverCategoryRail';
import { MarketplaceFeedSkeleton } from '../components/discover/DiscoverFeedSkeleton';
import { MarketplaceHeroCarousel } from '../components/discover/DiscoverHeroCarousel';
import { MarketplaceListingCard } from '../components/discover/DiscoverMarketplaceCard';
import { MarketplaceMomentumBar } from '../components/discover/DiscoverMomentumBar';
import { MarketplaceVaultHeader } from '../components/marketplace/MarketplaceVaultHeader';
import { SearchBar } from '../components/ui/SearchBar';
import { useMarketplaceLayout } from '../hooks/useMarketplaceLayout';
import { useMarketplaceCatalogSync } from '../hooks/useMarketplaceCatalogSync';
import { filterByMarketplaceLane } from '../lib/marketplaceCatalog';
import { buildMarketplaceHeroSlides } from '../lib/marketplaceHero';
import { computeMarketplaceGrid, marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../lib/marketplaceUiScale';
import { hasWarmHomeFeedCache, getHomeFeedMemorySnapshot } from '../lib/homeFeedCache';
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

export function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const layout = useMarketplaceLayout();
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const [lane, setLane] = useState<MarketplaceLaneId>('all');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>(() => getHomeFeedMemorySnapshot()?.listings ?? []);
  const loadedOnceRef = useRef(Boolean(getHomeFeedMemorySnapshot()?.listings.length));

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!isSupabaseConfigured()) {
      setCatalog([]);
      setLoading(false);
      loadedOnceRef.current = true;
      return;
    }
    const silent = opts?.silent ?? loadedOnceRef.current;
    if (!silent) setLoading(true);
    try {
      setCatalog(await fetchMarketplaceListings({ limit: 48 }));
    } finally {
      loadedOnceRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useMarketplaceCatalogSync(() => load({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      void touchAuctionPaymentExpiries(session?.access_token);
      if (!hasWarmHomeFeedCache()) {
        void load({ silent: loadedOnceRef.current });
      }
    }, [load, session?.access_token]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => filterByMarketplaceLane(catalog, lane), [catalog, lane]);
  const heroSlides = useMemo(() => buildMarketplaceHeroSlides(filtered), [filtered]);

  const openProduct = useCallback(
    (product: Product) => {
      navigation.navigate('ProductDetail', { productId: product.id });
    },
    [navigation],
  );

  const openHeroSlide = useCallback(
    (slide: { productId?: string }) => {
      if (slide.productId) {
        navigation.navigate('ProductDetail', { productId: slide.productId });
      }
    },
    [navigation],
  );

  const grid = useMemo(() => computeMarketplaceGrid(layout.contentWidth), [layout.contentWidth]);

  const hasListings = filtered.length > 0;
  const showBlockingSkeleton = loading && catalog.length === 0;
  const showEmpty = !showBlockingSkeleton && !hasListings;

  const renderItem = useCallback(
    ({ item, index }: { item: Product; index: number }) => (
      <MarketplaceListingCard
        product={item}
        width={grid.cardWidth}
        onPress={() => openProduct(item)}
        imagePriority={index < grid.cols * 2 ? 'high' : 'normal'}
      />
    ),
    [grid.cardWidth, grid.cols, openProduct],
  );

  const listHeader = (
    <View style={styles.header}>
      <MarketplaceVaultHeader />
      <SearchBar
        placeholder="Search the vault — cards, sneakers, watches…"
        onPress={() => openVaultSearch(navigation)}
        compact={layout.compact}
      />
      <MarketplaceCategoryRail active={lane} onChange={setLane} bleedPadding={layout.horizontalPadding} />

      {!showBlockingSkeleton && hasListings ? (
        <>
          <MarketplaceHeroCarousel slides={heroSlides} onSlidePress={openHeroSlide} />
          <MarketplaceMomentumBar compact={layout.compact} />
          <Text
            style={[styles.sectionTitle, { fontSize: marketplaceFontSize(layout.compact ? 15 : 17, layout.scale) }]}
            {...MARKETPLACE_TEXT_PROPS}
          >
            All listings
          </Text>
        </>
      ) : null}

      {showBlockingSkeleton ? (
        <MarketplaceFeedSkeleton
          heroHeight={layout.heroHeight}
          cardHeight={layout.listingCardHeight}
          cardWidth={layout.listingCardWidth}
        />
      ) : null}

      {showEmpty ? (
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
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <FlatList
        data={hasListings ? filtered : []}
        key={`mkt-grid-${grid.cols}`}
        numColumns={grid.cols}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        columnWrapperStyle={{ gap: grid.gap, marginBottom: grid.gap }}
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
        windowSize={7}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.gold} />
        }
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
    paddingTop: spacing.sm,
    flexGrow: 1,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginTop: spacing.xs,
  },
});
