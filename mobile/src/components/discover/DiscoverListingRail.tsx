import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';
import type { Product } from '../../types';
import { MarketplaceListingCard } from './DiscoverMarketplaceCard';

export function MarketplaceListingRail({
  title,
  subtitle,
  products,
  onPressProduct,
  onSeeAll,
  pulseIndex,
}: {
  title: string;
  subtitle?: string;
  products: Product[];
  onPressProduct: (p: Product) => void;
  onSeeAll?: () => void;
  pulseIndex?: number;
}) {
  if (!products.length) return null;

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        </View>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {products.map((p, i) => (
          <MarketplaceListingCard
            key={`${title}-${p.id}`}
            product={p}
            onPress={() => onPressProduct(p)}
            pulseBid={pulseIndex === i}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
    paddingRight: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3 },
  sub: { fontSize: 11, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  seeAll: { fontSize: 12, fontWeight: '800', color: colors.gold },
  rail: { paddingRight: spacing.lg },
});
