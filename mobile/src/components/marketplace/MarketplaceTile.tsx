import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import { marketplaceShippingLabel } from '../../lib/marketplaceShippingLabel';
import { marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { colors } from '../../theme';
import type { Product } from '../../types';
import { HeartButton } from './HeartButton';
import { LayawayPill } from './LayawayPill';

type Props = {
  product: Product;
  width: number;
  saved: boolean;
  scale: number;
  onPress: () => void;
  onToggleSave: () => void;
  imagePriority?: 'low' | 'normal' | 'high';
};

/** Compact eBay-style grid card: photo on top, plain text underneath. */
function MarketplaceTileBase({ product, width, saved, scale, onPress, onToggleSave, imagePriority = 'normal' }: Props) {
  const ship = marketplaceShippingLabel(product.shippingPriceUsd);
  const handle = product.seller.handle;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${product.listingPrice}`}
    >
      <View style={[styles.photo, { width, height: width }]}>
        <VaultImage uri={product.imageUrl} width={width} height={width} priority={imagePriority} contentFit="cover" />
        {product.allowLayaway ? <LayawayPill /> : null}
        <HeartButton saved={saved} onPress={onToggleSave} />
      </View>
      <View style={styles.text}>
        <Text
          style={[styles.title, { fontSize: marketplaceFontSize(11.5, scale), lineHeight: marketplaceFontSize(15, scale) }]}
          numberOfLines={2}
          ellipsizeMode="tail"
          {...MARKETPLACE_TEXT_PROPS}
        >
          {product.title}
        </Text>
        <Text style={[styles.price, { fontSize: marketplaceFontSize(15, scale) }]} numberOfLines={1} {...MARKETPLACE_TEXT_PROPS}>
          {product.listingPrice}
        </Text>
        {ship ? (
          <Text
            style={[styles.meta, { fontSize: marketplaceFontSize(11, scale) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            {...MARKETPLACE_TEXT_PROPS}
          >
            {ship}
          </Text>
        ) : null}
        {product.allowOffers ? (
          <Text style={[styles.meta, { fontSize: marketplaceFontSize(11, scale) }]} numberOfLines={1} {...MARKETPLACE_TEXT_PROPS}>
            or Best Offer
          </Text>
        ) : null}
        <Text style={[styles.seller, { fontSize: marketplaceFontSize(10.5, scale) }]} numberOfLines={1} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
          {handle}
        </Text>
      </View>
    </Pressable>
  );
}

export const MarketplaceTile = memo(MarketplaceTileBase);

const styles = StyleSheet.create({
  pressed: { opacity: 0.9 },
  photo: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  text: { paddingTop: 8, gap: 3 },
  title: { fontWeight: '500', color: colors.textPrimary },
  price: { fontWeight: '700', color: colors.textPrimary, lineHeight: 20 },
  meta: { fontWeight: '600', color: colors.textSecondary, lineHeight: 14 },
  seller: { color: '#8A8A8A', lineHeight: 14 },
});
