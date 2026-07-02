import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { VaultImage } from '../ui/VaultImage';
import { colors, radii, spacing } from '../../theme';
import type { Product } from '../../types';

const HERO_W = Dimensions.get('window').width - spacing.lg * 2;
const HERO_H = 196;

export function HomeFeaturedMarketplaceHero({
  product,
  onPressProduct,
  onPressExplore,
}: {
  product: Product | null;
  onPressProduct: () => void;
  onPressExplore: () => void;
}) {
  if (product) {
    return (
      <Pressable
        onPress={onPressProduct}
        style={({ pressed }) => [styles.shell, styles.productShell, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Featured listing: ${product.title}`}
      >
        {product.imageUrl ? (
          <VaultImage
            uri={product.imageUrl}
            width={HERO_W}
            height={HERO_H}
            priority="high"
            contentFit="cover"
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <LinearGradient colors={product.imageGradient} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.94)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.inner}>
          <View style={styles.topMeta}>
            {product.vaultVerified ? (
              <View style={styles.verifiedPill}>
                <Ionicons name="shield-checkmark" size={12} color={colors.gold} />
                <Text style={styles.verifiedTxt}>Vault verified</Text>
              </View>
            ) : null}
            <Text style={styles.price}>{product.listingPrice}</Text>
          </View>
          <Text style={styles.kicker}>Featured listing</Text>
          <Text style={styles.title} numberOfLines={2}>
            {product.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {product.storyline || product.seller.name || 'Authenticated collector inventory'}
          </Text>
          <View style={styles.cta}>
            <Text style={styles.ctaTxt}>View listing</Text>
            <Ionicons name="arrow-forward" size={16} color="#0a0a0a" />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPressExplore}
      style={({ pressed }) => [styles.shell, styles.fallbackShell, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Browse the vault marketplace"
    >
      <LinearGradient
        colors={['rgba(212,175,55,0.16)', 'rgba(12,12,14,0.98)', '#080809']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowOrb} pointerEvents="none" />
      <View style={styles.inner}>
        <Ionicons name="diamond-outline" size={26} color={colors.gold} />
        <Text style={styles.kicker}>The vault marketplace</Text>
        <Text style={styles.title}>Shop authenticated grails</Text>
        <Text style={styles.meta}>Buy now listings, offers, and verified seller inventory.</Text>
        <View style={[styles.cta, styles.ctaGhost]}>
          <Text style={[styles.ctaTxt, styles.ctaTxtGhost]}>Browse marketplace</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.gold} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: HERO_H,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  productShell: {
    borderColor: 'rgba(212,175,55,0.22)',
  },
  fallbackShell: {
    borderColor: 'rgba(212,175,55,0.28)',
  },
  pressed: { opacity: 0.94 },
  glowOrb: {
    position: 'absolute',
    top: -30,
    right: -10,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  inner: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
    gap: 4,
  },
  topMeta: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  verifiedTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.gold,
    letterSpacing: 0.2,
  },
  price: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textPrimary,
    marginLeft: 'auto',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  ctaGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  ctaTxt: { fontSize: 13, fontWeight: '800', color: '#0a0a0a' },
  ctaTxtGhost: { color: colors.gold },
});
