import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { MarketplaceCategoryRail, type MarketplaceLaneId } from '../components/discover/DiscoverCategoryRail';
import { MarketplaceFeedSkeleton } from '../components/discover/DiscoverFeedSkeleton';
import { MarketplaceHeroCarousel } from '../components/discover/DiscoverHeroCarousel';
import { MarketplaceListingRail } from '../components/discover/DiscoverListingRail';
import { MarketplaceMomentumBar } from '../components/discover/DiscoverMomentumBar';
import { MarketplaceSoldTicker } from '../components/discover/DiscoverSoldTicker';
import { MarketplaceVaultHeader } from '../components/marketplace/MarketplaceVaultHeader';
import { SearchBar } from '../components/ui/SearchBar';
import {
  isMarketplaceDemoProduct,
  marketplaceHeroSlides,
  marketplaceRecentSales,
} from '../data/marketplaceFeedMock';
import {
  buildMarketplaceCatalog,
  filterByMarketplaceLane,
  pickEndingSoon,
  pickLuxuryLane,
  pickMostWatched,
  pickNewArrivals,
  pickTrending,
  pickVaultVerified,
  sliceRail,
} from '../lib/marketplaceCatalog';
import { isSupabaseConfigured } from '../lib/supabase';
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
  const [catalogReal, setCatalogReal] = useState<Product[]>([]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setCatalogReal([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setCatalogReal(await fetchMarketplaceListings({ limit: 48 }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const catalog = useMemo(() => buildMarketplaceCatalog(catalogReal), [catalogReal]);
  const filtered = useMemo(() => filterByMarketplaceLane(catalog, lane), [catalog, lane]);

  const openProduct = useCallback(
    (product: Product) => {
      if (isMarketplaceDemoProduct(product.id)) return;
      navigation.navigate('ProductDetail', { productId: product.id });
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

        {!loading ? (
          <>
            <MarketplaceHeroCarousel slides={marketplaceHeroSlides} />
            <MarketplaceMomentumBar />

            <MarketplaceListingRail
              title="Featured listings"
              subtitle="Curated marketplace inventory"
              products={rails.featured}
              onPressProduct={openProduct}
              imagePriority="high"
            />

            <MarketplaceListingRail
              title="Trending marketplace"
              subtitle="Bids · views · collector demand"
              products={rails.trending}
              onPressProduct={openProduct}
              pulseIndex={0}
            />

            <MarketplaceListingRail
              title="Recently listed"
              subtitle="Fresh buy-now & auction lots"
              products={rails.recent}
              onPressProduct={openProduct}
            />

            <MarketplaceListingRail
              title="Ending soon"
              subtitle="Auctions closing"
              products={rails.ending}
              onPressProduct={openProduct}
              pulseIndex={1}
            />

            <MarketplaceSoldTicker sales={marketplaceRecentSales} />

            <MarketplaceListingRail
              title="Vault verified"
              subtitle="Authenticated inventory"
              products={rails.verified}
              onPressProduct={openProduct}
            />

            <MarketplaceListingRail
              title="Luxury lane"
              subtitle="Watches · high jewelry · grails"
              products={rails.luxury}
              onPressProduct={openProduct}
            />

            <MarketplaceListingRail
              title="Collector picks"
              subtitle="Lanes collectors save"
              products={rails.collector}
              onPressProduct={openProduct}
            />

            <MarketplaceListingRail
              title="Most watched"
              subtitle="Marketplace attention"
              products={rails.watched}
              onPressProduct={openProduct}
            />

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
