import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export function HomeCultureHero({
  onLiveHub,
  onVault,
}: {
  onLiveHub: () => void;
  onVault: () => void;
}) {
  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={['rgba(212,175,55,0.14)', 'rgba(8,8,10,0.98)', '#070708']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowOrb} pointerEvents="none" />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        style={styles.bottomFade}
        pointerEvents="none"
      />

      <View style={styles.inner}>
        <Text style={styles.kicker}>Live commerce for collectors</Text>
        <Text style={styles.title}>
          Break. <Text style={styles.titleEm}>Chase.</Text> Vault.
        </Text>
        <Text style={styles.tagline}>
          Live auctions, breaks, verified inventory, and collector-led selling — all in one vault.
        </Text>

        <View style={styles.ctaRow}>
          <Pressable style={styles.ctaPrimary} onPress={onLiveHub}>
            <Ionicons name="radio" size={16} color="#0a0a0a" />
            <Text style={styles.ctaPrimaryTxt}>Enter live</Text>
          </Pressable>
          <Pressable style={styles.ctaGhost} onPress={onVault}>
            <Text style={styles.ctaGhostTxt}>Browse vault</Text>
            <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.65)" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    minHeight: 148,
  },
  glowOrb: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
  },
  inner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    zIndex: 1,
    gap: 6,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(212,175,55,0.75)',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '300',
    color: colors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  titleEm: {
    fontWeight: '900',
    color: colors.gold,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
    maxWidth: 320,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  ctaPrimaryTxt: { fontSize: 14, fontWeight: '900', color: '#0a0a0a' },
  ctaGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  ctaGhostTxt: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.82)' },
});
