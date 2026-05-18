import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

const SUBTITLE = 'Buy verified grails across the vault.';

/** Restrained ambient layers — typography stays primary. */
function HeaderAmbience() {
  return (
    <>
      <View style={styles.matteBase} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(212,175,55,0.14)', 'rgba(212,175,55,0.04)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={styles.edgeTopLight}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(212,175,55,0.05)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.edgeLeftLight}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(212,175,55,0.07)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.85 }}
        style={styles.cornerGlow}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.5)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bottomVignette}
        pointerEvents="none"
      />
      <View style={styles.accentRule} pointerEvents="none" />
    </>
  );
}

export function MarketplaceVaultHeader() {
  return (
    <View style={styles.shell} accessibilityRole="header">
      <HeaderAmbience />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.eyebrow}>
            <Ionicons name="diamond-outline" size={11} color={colors.gold} />
            <Text style={styles.eyebrowTxt}>Get Vaulted</Text>
          </View>
          <View style={styles.verifiedPill}>
            <Ionicons name="shield-checkmark" size={12} color={colors.gold} />
            <Text style={styles.verifiedTxt}>Verified inventory</Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.titleLead} accessibilityRole="text">
            The{' '}
            <Text style={styles.titleVault}>Vault</Text>
          </Text>
          <LinearGradient
            colors={['transparent', 'rgba(212,175,55,0.55)', 'rgba(212,175,55,0.18)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.titleUnderline}
          />
        </View>

        <Text style={styles.subtitle}>{SUBTITLE}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  matteBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#08080a',
    borderRadius: radii.lg,
  },
  edgeTopLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  edgeLeftLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
  },
  cornerGlow: {
    position: 'absolute',
    top: -8,
    right: -12,
    width: 140,
    height: 90,
    borderTopRightRadius: radii.lg,
  },
  bottomVignette: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  accentRule: {
    position: 'absolute',
    top: 0,
    left: spacing.lg,
    right: spacing.lg,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(212,175,55,0.22)',
  },
  content: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    zIndex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrowTxt: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: 'rgba(212,175,55,0.85)',
    textTransform: 'uppercase',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  verifiedTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  titleBlock: {
    alignSelf: 'flex-start',
  },
  titleLead: {
    fontSize: 34,
    fontWeight: '300',
    color: colors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  titleVault: {
    fontWeight: '900',
    color: colors.gold,
    letterSpacing: -1,
  },
  titleUnderline: {
    height: 1,
    width: '68%',
    marginTop: 8,
    borderRadius: 1,
    opacity: 0.9,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 20,
    letterSpacing: -0.1,
    maxWidth: 320,
  },
});
