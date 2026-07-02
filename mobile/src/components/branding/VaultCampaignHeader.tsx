import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

export const VAULT_CAMPAIGN_HEADER_DEFAULTS = {
  signature: 'BREAK. CHASE. VAULT.',
  headline: 'THE HUNT STARTS HERE.',
  supporting: 'Live breaks, grails, auctions, and vault drops.',
} as const;

export type VaultCampaignHeaderProps = {
  signature?: string;
  headline?: string;
  supporting?: string;
};

/**
 * Compact branded identity strip — no card chrome, lives on the dark feed background.
 */
export function VaultCampaignHeader({
  signature = VAULT_CAMPAIGN_HEADER_DEFAULTS.signature,
  headline = VAULT_CAMPAIGN_HEADER_DEFAULTS.headline,
  supporting = VAULT_CAMPAIGN_HEADER_DEFAULTS.supporting,
}: VaultCampaignHeaderProps = {}) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={styles.ambient} pointerEvents="none">
        <LinearGradient
          colors={['rgba(212,175,55,0.14)', 'rgba(212,175,55,0.04)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowPrimary}
        />
        <LinearGradient
          colors={['transparent', 'rgba(255,59,48,0.04)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.glowSecondary}
        />
        <View style={styles.vaultBeam} />
      </View>

      <Text style={styles.signature}>{signature}</Text>
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.supporting}>{supporting}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm + 2,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  ambient: {
    ...StyleSheet.absoluteFillObject,
  },
  glowPrimary: {
    position: 'absolute',
    top: -28,
    left: -24,
    width: 220,
    height: 120,
    borderRadius: 110,
    opacity: 0.9,
  },
  glowSecondary: {
    position: 'absolute',
    right: -40,
    top: 8,
    width: 160,
    height: 72,
    borderRadius: 80,
  },
  vaultBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '38%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(212,175,55,0.08)',
    shadowColor: colors.gold,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  signature: {
    color: colors.gold,
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 3.2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  headline: {
    marginTop: 6,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.35,
    lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  supporting: {
    marginTop: 4,
    color: 'rgba(244,241,234,0.58)',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
    maxWidth: '96%',
  },
});
