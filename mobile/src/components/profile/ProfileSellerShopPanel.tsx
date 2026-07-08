import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchSellerShop, type SellerShopTab } from '../../api/sellerShopRepository';
import { MarketplaceListingCard } from '../discover/DiscoverMarketplaceCard';
import { colors, radii, spacing } from '../../theme';

const SHOP_TABS: { key: SellerShopTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'buy_now', label: 'Buy now' },
  { key: 'auctions', label: 'Auctions' },
  { key: 'sold', label: 'Sold' },
];

export function ProfileSellerShopPanel({
  sellerId,
  onPressProduct,
}: {
  sellerId: string;
  onPressProduct: (productId: string) => void;
}) {
  const [shopTab, setShopTab] = useState<SellerShopTab>('all');
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<Awaited<ReturnType<typeof fetchSellerShop>>>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchSellerShop({ sellerId, tab: shopTab }).then((result) => {
      if (cancelled) return;
      setShop(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sellerId, shopTab]);

  if (loading && !shop) {
    return <ActivityIndicator color={colors.gold} style={styles.loader} />;
  }

  if (!shop) {
    return <Text style={styles.muted}>This seller shop could not be loaded.</Text>;
  }

  const cardGap = spacing.sm;

  return (
    <View style={styles.block}>
      <Text style={styles.credibility}>{shop.seller.credibility}</Text>

      <View style={styles.stats}>
        <ShopStat label="Active" value={String(shop.stats.activeListings)} />
        <ShopStat label="Sold" value={String(shop.stats.soldListings)} />
        <ShopStat label="Live auctions" value={String(shop.stats.auctionsLive)} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {SHOP_TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setShopTab(t.key)}
            style={[styles.tab, shopTab === t.key && styles.tabOn]}
          >
            <Text style={[styles.tabTxt, shopTab === t.key && styles.tabTxtOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <ActivityIndicator color={colors.gold} style={styles.loaderInline} /> : null}

      {!loading && shop.products.length ? (
        <>
          <Text style={styles.resultCount}>
            {shop.total} listing{shop.total === 1 ? '' : 's'}
          </Text>
          <View style={[styles.grid, { gap: cardGap }]}>
            {shop.products.map((product) => (
              <View key={product.id} style={styles.gridItem}>
                <MarketplaceListingCard
                  product={product}
                  imagePriority="low"
                  onPress={() => onPressProduct(product.id)}
                />
              </View>
            ))}
          </View>
        </>
      ) : null}

      {!loading && !shop.products.length ? <Text style={styles.muted}>{shop.emptyCopy}</Text> : null}
    </View>
  );
}

function ShopStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  loader: { marginTop: spacing.lg },
  loaderInline: { marginVertical: spacing.sm },
  credibility: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 16, fontWeight: '800', color: colors.gold },
  statLbl: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  tabTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  tabTxtOn: { color: colors.gold },
  resultCount: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  gridItem: {},
  muted: { color: colors.textMuted, fontSize: 14 },
});
