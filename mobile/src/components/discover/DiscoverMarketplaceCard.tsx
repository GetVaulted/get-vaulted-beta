import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import { useMarketplaceLayout } from '../../hooks/useMarketplaceLayout';
import { marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { colors, radii, spacing } from '../../theme';
import type { Product } from '../../types';

export type MarketplaceCardBadge =
  | 'just_listed'
  | 'new_arrival'
  | 'ending'
  | 'trending'
  | 'verified'
  | 'buy_now'
  | 'also_live';

function badgeFor(product: Product): MarketplaceCardBadge | null {
  const liveNote = product.featuredInLive?.toLowerCase() ?? '';
  if (liveNote.includes('also featured live')) return 'also_live';
  if (product.storyline?.toLowerCase().includes('new arrival')) return 'new_arrival';
  if (product.storyline?.toLowerCase().includes('just listed')) return 'just_listed';
  if (product.storyline?.toLowerCase().includes('trending')) return 'trending';
  if (product.auctionEnds) return 'ending';
  if (product.buyNow) return 'buy_now';
  if (product.vaultVerified) return 'verified';
  return null;
}

const BADGE_COPY: Record<MarketplaceCardBadge, { label: string; color: string }> = {
  just_listed: { label: 'Just listed', color: colors.gold },
  new_arrival: { label: 'New arrival', color: colors.gold },
  ending: { label: 'Ending soon', color: '#FF9F0A' },
  trending: { label: 'Trending', color: '#7B68EE' },
  verified: { label: 'Vault verified', color: colors.gold },
  buy_now: { label: 'Buy now', color: '#5AC8FA' },
  also_live: { label: 'Also featured live', color: colors.textSecondary },
};

export function MarketplaceListingCard({
  product,
  onPress,
  pulseBid,
  imagePriority = 'normal',
}: {
  product: Product;
  onPress: () => void;
  pulseBid?: boolean;
  imagePriority?: 'low' | 'normal' | 'high';
}) {
  const layout = useMarketplaceLayout();
  const cardW = layout.listingCardWidth;
  const cardH = layout.listingCardHeight;
  const pulse = useRef(new Animated.Value(1)).current;
  const badge = badgeFor(product);

  useEffect(() => {
    if (!pulseBid) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, pulseBid]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shell, { width: cardW }, pressed && styles.pressed]}>
      <Animated.View style={[styles.card, { width: cardW, height: cardH }, pulseBid && { transform: [{ scale: pulse }] }]}>
        <View style={[styles.mediaSlot, { width: cardW, height: cardH }]} pointerEvents="none">
          {product.imageUrl ? (
            <VaultImage
              uri={product.imageUrl}
              width={cardW}
              height={cardH}
              priority={imagePriority}
              contentFit="cover"
            />
          ) : (
            <LinearGradient colors={product.imageGradient} style={StyleSheet.absoluteFill} />
          )}
        </View>
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.glowEdge} pointerEvents="none" />
        <View style={styles.top}>
          {badge ? (
            <View style={[styles.badge, { borderColor: `${BADGE_COPY[badge].color}66` }]}>
              <Text style={[styles.badgeTxt, { color: BADGE_COPY[badge].color }]} {...MARKETPLACE_TEXT_PROPS}>
                {BADGE_COPY[badge].label}
              </Text>
            </View>
          ) : null}
          {product.vaultVerified ? (
            <Ionicons name="shield-checkmark" size={14} color={colors.gold} />
          ) : null}
        </View>
        <View style={styles.bottom}>
          <Text style={[styles.price, { fontSize: marketplaceFontSize(layout.compact ? 14 : 15, layout.scale) }]} {...MARKETPLACE_TEXT_PROPS}>
            {product.listingPrice}
          </Text>
          <Text style={[styles.title, { fontSize: marketplaceFontSize(layout.compact ? 11 : 12, layout.scale) }]} numberOfLines={2} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
            {product.title}
          </Text>
          {product.conditionGrade ? (
            <Text style={styles.grade} numberOfLines={1} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
              {product.conditionGrade}
            </Text>
          ) : null}
          <View style={styles.sellerRow}>
            <VaultImage
              uri={product.seller.avatarUrl}
              width={18}
              height={18}
              borderRadius={9}
              priority="low"
            />
            <Text style={styles.seller} numberOfLines={1} ellipsizeMode="tail" {...MARKETPLACE_TEXT_PROPS}>
              {product.seller.handle}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { marginRight: spacing.sm, flexShrink: 0 },
  pressed: { opacity: 0.94 },
  card: {
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  mediaSlot: {
    ...StyleSheet.absoluteFillObject,
  },
  glowEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.sm,
    zIndex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: '78%',
  },
  badgeTxt: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  bottom: { flex: 1, justifyContent: 'flex-end', padding: spacing.sm, gap: 2, zIndex: 1 },
  price: { fontWeight: '900', color: colors.gold, letterSpacing: -0.3 },
  title: { fontWeight: '800', color: '#fff', lineHeight: 15 },
  grade: { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  seller: { flex: 1, fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
});
