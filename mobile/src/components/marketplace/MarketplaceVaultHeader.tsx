import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { useMarketplaceLayout } from '../../hooks/useMarketplaceLayout';
import { marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { colors, radii, spacing } from '../../theme';

const SUBTITLE = 'Buy verified grails across the vault.';

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
  const layout = useMarketplaceLayout();
  const titleSize = marketplaceFontSize(layout.compact ? 28 : 34, layout.scale);
  const titleLine = marketplaceFontSize(layout.compact ? 32 : 38, layout.scale);
  const subtitleSize = marketplaceFontSize(layout.compact ? 13 : 14, layout.scale);

  return (
    <View style={styles.shell} accessibilityRole="header">
      <HeaderAmbience />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.eyebrow}>
            <Ionicons name="diamond-outline" size={layout.compact ? 10 : 11} color={colors.gold} />
            <Text style={[styles.eyebrowTxt, { fontSize: marketplaceFontSize(10, layout.scale) }]} {...MARKETPLACE_TEXT_PROPS}>
              Get Vaulted
            </Text>
          </View>
          <View style={[styles.verifiedPill, layout.compact && styles.verifiedPillCompact]}>
            <Ionicons name="shield-checkmark" size={layout.compact ? 11 : 12} color={colors.gold} />
            <Text
              style={[styles.verifiedTxt, { fontSize: marketplaceFontSize(10, layout.scale) }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              {...MARKETPLACE_TEXT_PROPS}
            >
              Verified inventory
            </Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text
            style={[styles.titleLead, { fontSize: titleSize, lineHeight: titleLine }]}
            accessibilityRole="text"
            {...MARKETPLACE_TEXT_PROPS}
          >
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

        <Text
          style={[styles.subtitle, { fontSize: subtitleSize, maxWidth: layout.contentWidth * 0.92 }]}
          numberOfLines={2}
          ellipsizeMode="tail"
          {...MARKETPLACE_TEXT_PROPS}
        >
          {SUBTITLE}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    maxWidth: '100%',
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
    maxWidth: '100%',
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
    flexShrink: 1,
  },
  eyebrowTxt: {
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
    flexShrink: 1,
    maxWidth: '52%',
  },
  verifiedPillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '48%',
  },
  verifiedTxt: {
    fontWeight: '700',
    color: colors.textMuted,
    flexShrink: 1,
  },
  titleBlock: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  titleLead: {
    fontWeight: '300',
    color: colors.textPrimary,
    letterSpacing: -0.8,
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
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
});
