import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMarketplaceLayout } from '../../hooks/useMarketplaceLayout';
import { marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
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
  imagePriority = 'normal',
}: {
  title: string;
  subtitle?: string;
  products: Product[];
  onPressProduct: (p: Product) => void;
  onSeeAll?: () => void;
  pulseIndex?: number;
  imagePriority?: 'low' | 'normal' | 'high';
}) {
  const layout = useMarketplaceLayout();

  if (!products.length) return null;

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.title, { fontSize: marketplaceFontSize(layout.compact ? 15 : 17, layout.scale) }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            {...MARKETPLACE_TEXT_PROPS}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.sub, { fontSize: marketplaceFontSize(11, layout.scale) }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              {...MARKETPLACE_TEXT_PROPS}
            >
              {subtitle}
            </Text>
          ) : null}
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
            imagePriority={imagePriority}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg, maxWidth: '100%' },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
    paddingRight: spacing.sm,
  },
  title: { fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3 },
  sub: { color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  seeAll: { fontSize: 12, fontWeight: '800', color: colors.gold },
  rail: { paddingRight: spacing.lg },
});
