import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from './UserAvatar';
import { VaultImage } from './VaultImage';
import { colors, radii, spacing, typography } from '../../theme';
import type { CategoryId, Product } from '../../types';

function categoryIcon(cat: CategoryId): keyof typeof Ionicons.glyphMap {
  switch (cat) {
    case 'watches':
      return 'time-outline';
    case 'sneakers':
      return 'footsteps-outline';
    case 'cards':
      return 'layers-outline';
    case 'memorabilia':
      return 'trophy-outline';
    case 'other':
      return 'apps-outline';
    default:
      return 'diamond-outline';
  }
}

type Props = {
  product: Product;
  onPress: () => void;
  variant?: 'default' | 'compact' | 'rail' | 'grid';
  /** Rich marketplace row: seller, last sale, optional live note (Browse). */
  marketplaceMeta?: boolean;
  /** Width for `grid` tiles (two-column Browse). */
  gridWidth?: number;
};

export function ProductCard({
  product,
  onPress,
  variant = 'default',
  marketplaceMeta = false,
  gridWidth,
}: Props) {
  const rail = variant === 'rail';
  const compact = variant === 'compact';
  const grid = variant === 'grid';

  const width = grid ? (gridWidth ?? 168) : rail ? 184 : compact ? 160 : 236;
  const minH = grid ? 300 : rail ? 292 : compact ? 200 : 300;

  const rich = marketplaceMeta && (rail || grid);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.press,
        grid && styles.pressGrid,
        { width },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.frame, { minHeight: minH }]}>
        {product.imageUrl ? (
          <VaultImage
            uri={product.imageUrl}
            width={width}
            height={minH}
            priority="normal"
            style={{ position: 'absolute', top: 0, left: 0 }}
          />
        ) : null}
        <LinearGradient
          colors={product.imageGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, product.imageUrl && styles.gradientOverPhoto]}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.02)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.34, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {!product.imageUrl ? (
          <Ionicons
            name={categoryIcon(product.category)}
            size={grid ? 56 : rail ? 56 : compact ? 72 : 88}
            color="rgba(255,255,255,0.08)"
            style={styles.categoryWatermark}
          />
        ) : null}
        <View style={styles.topRow}>
          {product.vaultVerified ? (
            <View style={styles.pill}>
              <Ionicons name="shield-checkmark" size={11} color={colors.gold} />
              <Text style={styles.pillText}>Vault verified</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.bottom, rich && styles.bottomRich]}>
          <Text
            style={[grid ? styles.titleGrid : rail ? styles.titleRail : styles.title]}
            numberOfLines={rich ? 2 : 2}
          >
            {product.title}
          </Text>

          {rich ? (
            <>
              {product.conditionGrade ? (
                <Text style={styles.grade} numberOfLines={2}>
                  {product.conditionGrade}
                </Text>
              ) : null}
              <Text style={styles.listingPrice} numberOfLines={1}>
                {product.listingPrice}
              </Text>
              <View style={styles.sellerRow}>
                <UserAvatar
                  uri={product.seller.avatarUrl}
                  name={product.seller.name}
                  username={product.seller.handle}
                  size={22}
                  tone="light"
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sellerLabel} numberOfLines={1}>
                    Seller
                  </Text>
                  <Text style={styles.sellerName} numberOfLines={1}>
                    {product.seller.name}
                  </Text>
                  <Text style={styles.sellerHandle} numberOfLines={1}>
                    {product.seller.handle}
                  </Text>
                </View>
              </View>
              {product.featuredInLive ? (
                <View style={styles.liveHint}>
                  <Ionicons name="radio-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.liveHintText} numberOfLines={2}>
                    {product.featuredInLive}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              {product.storyline ? (
                <Text style={styles.story} numberOfLines={rail ? 2 : 1}>
                  {product.storyline}
                </Text>
              ) : null}
              {product.conditionGrade ? (
                <Text style={styles.story} numberOfLines={1}>
                  {product.conditionGrade}
                </Text>
              ) : null}
              <Text style={styles.meta} numberOfLines={1}>
                {product.listingPrice}
              </Text>
              {!rail && product.auctionEnds ? (
                <Text style={styles.auction}>Live · {product.auctionEnds}</Text>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: {
    marginRight: spacing.md,
  },
  pressGrid: {
    marginRight: 0,
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  frame: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
  },
  gradientOverPhoto: {
    opacity: 0.2,
  },
  categoryWatermark: {
    position: 'absolute',
    alignSelf: 'center',
    top: '22%',
  },
  topRow: {
    padding: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  pillText: {
    color: colors.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  bottom: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    gap: 4,
    zIndex: 1,
  },
  bottomRich: {
    paddingTop: spacing.md,
    gap: 6,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  titleRail: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  titleGrid: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    letterSpacing: -0.15,
  },
  story: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  grade: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
  },
  listingPrice: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  sellerLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  sellerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sellerName: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  sellerHandle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
  },
  liveHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  liveHintText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
  auction: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
