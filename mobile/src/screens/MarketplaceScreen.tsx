import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { touchAuctionPaymentExpiries } from '../api/touchAuctionPaymentExpiries';
import { useAuth } from '../auth/AuthContext';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { MarketplaceCategoryRail, type MarketplaceLaneId } from '../components/discover/DiscoverCategoryRail';
import { MarketplaceFeedSkeleton } from '../components/discover/DiscoverFeedSkeleton';
import { MarketplaceHeroCarousel } from '../components/discover/DiscoverHeroCarousel';
import { MarketplaceListingRail } from '../components/discover/DiscoverListingRail';
import { MarketplaceMomentumBar } from '../components/discover/DiscoverMomentumBar';
import { MarketplaceVaultHeader } from '../components/marketplace/MarketplaceVaultHeader';
import { SearchBar } from '../components/ui/SearchBar';
import { useMarketplaceLayout } from '../hooks/useMarketplaceLayout';
import { useMarketplaceCatalogSync } from '../hooks/useMarketplaceCatalogSync';
import {
  buildMarketplaceDiscoveryRails,
  filterByMarketplaceLane,
} from '../lib/marketplaceCatalog';
import { buildMarketplaceHeroSlides } from '../lib/marketplaceHero';
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

  const rails = useMemo(() => buildMarketplaceDiscoveryRails(filtered), [filtered]);

  const hasListings = filtered.length > 0;
  const showBlockingSkeleton = loading && catalog.length === 0;
  const showEmpty = !showBlockingSkeleton && !hasListings;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: layout.horizontalPadding,
            paddingBottom: layout.tabBarClearance,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.gold} />
        }
      >
        <MarketplaceVaultHeader />
        <SearchBar
          placeholder="Search the vault — cards, sneakers, watches…"
          onPress={() => openVaultSearch(navigation)}
          compact={layout.compact}
        />

        <MarketplaceCategoryRail active={lane} onChange={setLane} bleedPadding={layout.horizontalPadding} />

        {showBlockingSkeleton ? (
          <MarketplaceFeedSkeleton
            heroHeight={layout.heroHeight}
            cardHeight={layout.listingCardHeight}
            cardWidth={layout.listingCardWidth}
          />
        ) : null}

        {!showBlockingSkeleton && showEmpty ? (
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

        {!showBlockingSkeleton && hasListings ? (
          <>
            <MarketplaceHeroCarousel slides={heroSlides} onSlidePress={openHeroSlide} />
            <MarketplaceMomentumBar compact={layout.compact} />

            {rails.featured.length ? (
              <MarketplaceListingRail
                title="Featured listings"
                subtitle="Live marketplace inventory"
                products={rails.featured}
                onPressProduct={openProduct}
                imagePriority="high"
              />
            ) : null}

            {rails.trending.length ? (
              <MarketplaceListingRail
                title="Trending now"
                subtitle="Popular buy-now listings"
                products={rails.trending}
                onPressProduct={openProduct}
                pulseIndex={0}
              />
            ) : null}

            {rails.recent.length ? (
              <MarketplaceListingRail
                title="Recently listed"
                subtitle="Fresh buy-now inventory"
                products={rails.recent}
                onPressProduct={openProduct}
              />
            ) : null}

            {rails.ending.length ? (
              <MarketplaceListingRail
                title="Ending soon"
                subtitle="Auctions closing"
                products={rails.ending}
                onPressProduct={openProduct}
                pulseIndex={1}
              />
            ) : null}

            {rails.verified.length ? (
              <MarketplaceListingRail
                title="Vault verified"
                subtitle="Authenticated inventory"
                products={rails.verified}
                onPressProduct={openProduct}
              />
            ) : null}

            {rails.luxury.length ? (
              <MarketplaceListingRail
                title="Luxury lane"
                subtitle="Watches · high jewelry · grails"
                products={rails.luxury}
                onPressProduct={openProduct}
              />
            ) : null}

            {rails.collector.length ? (
              <MarketplaceListingRail
                title="Collector picks"
                subtitle="Saved lanes & categories"
                products={rails.collector}
                onPressProduct={openProduct}
              />
            ) : null}

            {rails.watched.length ? (
              <MarketplaceListingRail
                title="High attention"
                subtitle="Listings with collector views"
                products={rails.watched}
                onPressProduct={openProduct}
              />
            ) : null}

            {rails.arrivals.length ? (
              <MarketplaceListingRail
                title="New arrivals"
                subtitle="Just listed in the vault"
                products={rails.arrivals}
                onPressProduct={openProduct}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
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
    gap: spacing.sm,
    flexGrow: 1,
  },
});
