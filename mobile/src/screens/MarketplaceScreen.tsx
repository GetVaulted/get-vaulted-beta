import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { MarketplaceCategoryRail, type MarketplaceLaneId } from '../components/discover/DiscoverCategoryRail';
import { MarketplaceFeedSkeleton } from '../components/discover/DiscoverFeedSkeleton';
import { MarketplaceHeroCarousel } from '../components/discover/DiscoverHeroCarousel';
import { MarketplaceListingRail } from '../components/discover/DiscoverListingRail';
import { MarketplaceMomentumBar } from '../components/discover/DiscoverMomentumBar';
import { MarketplaceVaultHeader } from '../components/marketplace/MarketplaceVaultHeader';
import { SearchBar } from '../components/ui/SearchBar';
import {
  filterByMarketplaceLane,
  pickEndingSoon,
  pickLuxuryLane,
  pickMostWatched,
  pickNewArrivals,
  pickTrending,
  pickVaultVerified,
  sliceRail,
} from '../lib/marketplaceCatalog';
import { buildMarketplaceHeroSlides } from '../lib/marketplaceHero';
import { hasWarmHomeFeedCache, subscribeHomeFeedInvalidation } from '../lib/homeFeedCache';
import { isSupabaseConfigured } from '../lib/supabase';
import { openCreateListing } from '../navigation/openCreateListing';
import { openHelpCenter } from '../navigation/openPlatform';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';
import type { Product } from '../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [lane, setLane] = useState<MarketplaceLaneId>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setCatalog([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setCatalog(await fetchMarketplaceListings({ limit: 48 }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeHomeFeedInvalidation(() => {
      void load();
    });
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!hasWarmHomeFeedCache()) {
        void load();
      }
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
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

  const rails = useMemo(
    () => ({
      featured: sliceRail(filtered, 0, 8),
      trending: pickTrending(filtered, 8),
      recent: sliceRail(filtered, 2, 8),
      ending: pickEndingSoon(filtered, 7),
      verified: pickVaultVerified(filtered, 8),
      luxury: pickLuxuryLane(filtered, 7),
      collector: sliceRail(filtered, 5, 8),
      watched: pickMostWatched(filtered, 7),
      arrivals: pickNewArrivals(filtered, 8),
    }),
    [filtered],
  );

  const hasListings = filtered.length > 0;
  const showEmpty = !loading && !hasListings;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <MarketplaceVaultHeader />
      <SearchBar
        placeholder="Search the vault — cards, sneakers, watches…"
        onPress={() => openHelpCenter(navigation, true)}
      />

      <MarketplaceCategoryRail active={lane} onChange={setLane} />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.gold} />
        }
      >
        {loading ? <MarketplaceFeedSkeleton /> : null}

        {!loading && showEmpty ? (
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

        {!loading && hasListings ? (
          <>
            <MarketplaceHeroCarousel slides={heroSlides} onSlidePress={openHeroSlide} />
            <MarketplaceMomentumBar />

            <MarketplaceListingRail
              title="Featured listings"
              subtitle="Live marketplace inventory"
              products={rails.featured}
              onPressProduct={openProduct}
              imagePriority="high"
            />

            {rails.trending.length ? (
              <MarketplaceListingRail
                title="Trending now"
                subtitle="Popular buy-now listings"
                products={rails.trending}
                onPressProduct={openProduct}
                pulseIndex={0}
              />
            ) : null}

            <MarketplaceListingRail
              title="Recently listed"
              subtitle="Fresh buy-now inventory"
              products={rails.recent}
              onPressProduct={openProduct}
            />

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

            <MarketplaceListingRail
              title="Collector picks"
              subtitle="Saved lanes & categories"
              products={rails.collector}
              onPressProduct={openProduct}
            />

            {rails.watched.length ? (
              <MarketplaceListingRail
                title="High attention"
                subtitle="Listings with collector views"
                products={rails.watched}
                onPressProduct={openProduct}
              />
            ) : null}

            <MarketplaceListingRail
              title="New arrivals"
              subtitle="Just listed in the vault"
              products={rails.arrivals}
              onPressProduct={openProduct}
            />
          </>
        ) : null}

        <View style={{ height: spacing.xxxl + 24 }} />
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
  body: {
    paddingTop: spacing.sm,
    paddingBottom: 120,
  },
});
