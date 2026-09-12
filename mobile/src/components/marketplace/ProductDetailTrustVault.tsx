import { Text, View, StyleSheet } from 'react-native';
import type { ItemTrustMetrics } from '../../lib/marketplaceItemTrust';
import { MARKETPLACE_TEXT_PROPS } from '../../lib/marketplaceUiScale';
import { colors, radii, spacing } from '../../theme';

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLbl} {...MARKETPLACE_TEXT_PROPS}>
        {label}
      </Text>
      <Text
        style={[styles.statVal, highlight && styles.statValHi]}
        numberOfLines={1}
        {...MARKETPLACE_TEXT_PROPS}
      >
        {value}
      </Text>
    </View>
  );
}

/** Mirrors web MarketplaceItemTrustVault — real signals only (no fabricated response/ship %). */
export function ProductDetailTrustVault({ metrics }: { metrics: ItemTrustMetrics }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker} {...MARKETPLACE_TEXT_PROPS}>
        Trust vault
      </Text>
      <View style={styles.grid}>
        <Stat label="Seller level" value={metrics.sellerLevel ?? 'Vault seller'} highlight />
        <Stat label="Completed sales" value={metrics.completedSales} />
        <Stat label="Account standing" value={metrics.accountStanding} />
        <Stat label="Authentication" value={metrics.authenticationStatus} />
      </View>
    </View>
  );
}

const CONFIDENCE = [
  'Protected checkout',
  'Verified seller',
  'Secure shipping',
  'Authentication available',
  'Buyer protection',
] as const;

export function ProductDetailConfidenceStrip() {
  return (
    <View style={styles.strip}>
      {CONFIDENCE.map((label) => (
        <View key={label} style={styles.chip}>
          <Text style={styles.check} {...MARKETPLACE_TEXT_PROPS}>
            ✓
          </Text>
          <Text style={styles.chipTxt} {...MARKETPLACE_TEXT_PROPS}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.18)',
    backgroundColor: 'rgba(201,162,39,0.05)',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  kicker: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  stat: {
    width: '47%',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(12,12,16,0.8)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statLbl: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statVal: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  statValHi: {
    color: colors.gold,
  },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,10,12,0.9)',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  check: {
    color: '#6ee7b7',
    fontSize: 12,
    fontWeight: '700',
  },
  chipTxt: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
});
