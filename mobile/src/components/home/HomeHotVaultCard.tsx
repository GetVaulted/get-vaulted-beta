import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import { isDisplayableMarketplaceProduct } from '../../lib/marketplaceListingQuality';
import { colors, radii, spacing } from '../../theme';
import type { Product } from '../../types';

export const HOME_HOT_VAULT_CARD_WIDTH = 176;
export const HOME_HOT_VAULT_CARD_HEIGHT = 248;

function listingBadges(product: Product): string[] {
  const badges: string[] = [];
  if (product.vaultVerified) badges.push('Vault Pick');
  if (product.featuredInLive) badges.push('On Live');
  if (product.allowOffers) badges.push('Offers Open');
  if (product.auctionEnds) badges.push('Ending Soon');
  return badges.slice(0, 2);
}

export function HomeHotVaultCard({ product, onPress }: { product: Product; onPress: () => void }) {
  if (!isDisplayableMarketplaceProduct(product)) return null;

  const badges = listingBadges(product);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${product.listingPrice}`}
    >
      <View style={styles.imageWrap}>
        {product.imageUrl ? (
          <VaultImage
            uri={product.imageUrl}
            width={HOME_HOT_VAULT_CARD_WIDTH}
            height={148}
            priority="normal"
            contentFit="cover"
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <LinearGradient colors={product.imageGradient} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.imageFade} />
        <View style={styles.badgeRow}>
          {badges.map((badge) => (
            <View key={badge} style={styles.badge}>
              <Text style={styles.badgeTxt}>{badge}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.price}>{product.listingPrice}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{product.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.seller} numberOfLines={1}>{product.seller.name}</Text>
          {product.conditionGrade ? (
            <Text style={styles.grade} numberOfLines={1}>{product.conditionGrade}</Text>
          ) : null}
        </View>
        {product.storyline ? (
          <Text style={styles.storyline} numberOfLines={1}>{product.storyline}</Text>
        ) : (
          <View style={styles.ctaRow}>
            <Text style={styles.ctaTxt}>View item</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.gold} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: HOME_HOT_VAULT_CARD_WIDTH,
    minHeight: HOME_HOT_VAULT_CARD_HEIGHT,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pressed: { opacity: 0.92 },
  imageWrap: {
    height: 148,
    backgroundColor: '#111',
  },
  imageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  badgeRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  badgeTxt: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.gold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  price: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
  },
  body: {
    padding: spacing.sm + 2,
    gap: 4,
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  seller: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  grade: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.gold,
  },
  storyline: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ctaTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
  },
});
