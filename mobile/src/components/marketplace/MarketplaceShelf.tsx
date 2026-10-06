import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import { marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { colors } from '../../theme';
import type { Product } from '../../types';
import { HeartButton } from './HeartButton';
import { LayawayPill } from './LayawayPill';

const TILE = 88;

/** Thin horizontal row of small tiles ("Recently viewed", "Your favorites"). */
export function MarketplaceShelf({
  title,
  products,
  savedIds,
  scale,
  bleed,
  onOpen,
  onToggleSave,
  onSeeAll,
}: {
  title: string;
  products: Product[];
  savedIds: Set<string>;
  scale: number;
  bleed: number;
  onOpen: (product: Product) => void;
  onToggleSave: (product: Product) => void;
  onSeeAll?: () => void;
}) {
  if (products.length === 0) return null;
  return (
    <View style={styles.shell}>
      <View style={styles.head}>
        <Text style={[styles.title, { fontSize: marketplaceFontSize(15, scale) }]} accessibilityRole="header" {...MARKETPLACE_TEXT_PROPS}>
          {title}
        </Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={10} accessibilityRole="button" accessibilityLabel={`See all ${title}`}>
            <Text style={styles.seeAll} {...MARKETPLACE_TEXT_PROPS}>
              See all
            </Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -bleed }}
        contentContainerStyle={[styles.list, { paddingHorizontal: bleed }]}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onOpen(item)}
            style={styles.tile}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.listingPrice}`}
          >
            <View style={styles.photo}>
              <VaultImage uri={item.imageUrl} width={TILE} height={TILE} contentFit="cover" />
              {item.allowLayaway ? <LayawayPill small /> : null}
              <HeartButton saved={savedIds.has(item.id)} onPress={() => onToggleSave(item)} size={24} />
            </View>
            <Text style={[styles.price, { fontSize: marketplaceFontSize(12, scale) }]} numberOfLines={1} {...MARKETPLACE_TEXT_PROPS}>
              {item.listingPrice}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { gap: 8, marginTop: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '900', color: colors.textPrimary, letterSpacing: 0.4, textTransform: 'uppercase' },
  seeAll: { fontSize: 12, fontWeight: '600', color: colors.gold },
  list: { gap: 8 },
  tile: { width: TILE, gap: 5 },
  photo: {
    width: TILE,
    height: TILE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  price: { fontWeight: '700', color: colors.textPrimary },
});
