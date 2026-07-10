import { StyleSheet, Text, View } from 'react-native';
import {
  estimateListingPayoutFromItemPrice,
  formatUsdMoney,
  STRIPE_FEE_RATE_LABEL,
} from '../lib/sellerOrderPayoutDisplay';
import { colors, radii, spacing } from '../theme';

function MoneyRow({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={styles.moneyRow}>
      <Text style={[styles.moneyLabel, strong && styles.moneyLabelStrong]}>{label}</Text>
      <Text
        style={[
          styles.moneyValue,
          strong && styles.moneyValueStrong,
          accent && styles.moneyValueAccent,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function ListingPricingPayoutCard({
  itemPriceUsd,
  platformFeePercent,
  feeRateLabel,
}: {
  itemPriceUsd: number;
  platformFeePercent: number;
  feeRateLabel: string;
}) {
  const estimate = estimateListingPayoutFromItemPrice(itemPriceUsd, platformFeePercent);
  if (!estimate) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Estimated payout</Text>
      <Text style={styles.subtitle}>
        Based on your item price. Shipping collected at checkout is yours; using a Get Vaulted label deducts the
        carrier cost from payout. Shipping elsewhere means you pay that carrier yourself.
      </Text>
      <MoneyRow label="Item price" value={formatUsdMoney(estimate.itemPriceUsd)} />
      <MoneyRow
        label={`Get Vaulted (${feeRateLabel})`}
        value={`−${formatUsdMoney(estimate.platformFeeUsd)}`}
      />
      <MoneyRow
        label={`Card processing (${STRIPE_FEE_RATE_LABEL})`}
        value={`−${formatUsdMoney(estimate.stripeProcessingFeeUsd)}`}
      />
      <View style={styles.divider} />
      <MoneyRow label="Est. payout" value={formatUsdMoney(estimate.estimatedPayoutUsd)} strong accent />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.xs },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  moneyLabel: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  moneyLabelStrong: { color: colors.textPrimary, fontWeight: '700' },
  moneyValue: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  moneyValueStrong: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  moneyValueAccent: { color: colors.gold },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: spacing.xs,
  },
});
