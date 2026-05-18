import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

const CHIPS = ['Live auctions', 'Verified inventory', 'Vault events'] as const;

export function HomeCultureHero({
  onLiveHub,
  onVault,
}: {
  onLiveHub: () => void;
  onVault: () => void;
}) {
  return (
    <View style={styles.shell} accessibilityRole="header">
      <View style={styles.matte} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(212,175,55,0.1)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.edgeLight}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={styles.bottomFade}
        pointerEvents="none"
      />

      <View style={styles.inner}>
        <Text style={styles.kicker}>Premium live collectible marketplace</Text>
        <Text style={styles.title}>
          Break.{' '}
          <Text style={styles.titleEm}>Chase.</Text>
          {'\n'}
          Vault.
        </Text>
        <Text style={styles.tagline}>Live rooms. Verified inventory. Collector commerce.</Text>
        <Text style={styles.support}>
          A premium live collectible network for auctions, drops, breaks, and collector-led selling.
        </Text>

        <View style={styles.chipRow}>
          {CHIPS.map((c) => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipTxt}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={styles.ctaRow}>
          <Pressable style={styles.ctaPrimary} onPress={onLiveHub}>
            <Ionicons name="radio" size={18} color="#0a0a0a" />
            <Text style={styles.ctaPrimaryTxt}>Enter live</Text>
          </Pressable>
          <Pressable style={styles.ctaGhost} onPress={onVault}>
            <Ionicons name="diamond-outline" size={18} color={colors.gold} />
            <Text style={styles.ctaGhostTxt}>The Vault</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 240,
  },
  matte: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070708',
  },
  edgeLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },
  inner: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
    zIndex: 1,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: 'rgba(212,175,55,0.85)',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: spacing.sm,
    fontSize: 38,
    fontWeight: '300',
    color: colors.textPrimary,
    letterSpacing: -1.2,
    lineHeight: 42,
  },
  titleEm: {
    fontWeight: '900',
    color: colors.gold,
  },
  tagline: {
    marginTop: spacing.sm,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: -0.2,
  },
  support: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 19,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.3,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  ctaPrimaryTxt: { fontSize: 15, fontWeight: '900', color: '#0a0a0a' },
  ctaGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  ctaGhostTxt: { fontSize: 15, fontWeight: '800', color: colors.gold },
});
