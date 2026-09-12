import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { SellerAnalyticsSnapshot } from '../../../api/sellerAnalyticsRepository';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

/** Curated "best story" card — not shown on Revenue or Insights, which only list flat rows. */
export function SellerHQSpotlightCard({ analytics }: { analytics: SellerAnalyticsSnapshot }) {
  const sale = analytics.topSaleThisWeek;
  if (!sale) return null;

  return (
    <View>
      <View style={styles.eyebrowRow}>
        <Ionicons name="star-outline" size={11} color={colors.gold} />
        <Text style={styles.eyebrow}>This week's highlight</Text>
      </View>
      <View style={[styles.card, hq.goldCard]}>
        <View style={styles.thumb}>
          <Ionicons name={sale.channel === 'live' ? 'radio-outline' : 'pricetag-outline'} size={22} color={colors.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {sale.listingTitle}
          </Text>
          <Text style={styles.meta}>
            {sale.channel === 'live' ? 'Live show' : 'Marketplace'}
            {sale.buyerUsername ? ` · to @${sale.buyerUsername}` : ''}
          </Text>
          <Text style={styles.price}>{formatUsd(sale.totalCents)}</Text>
          {sale.isRepeatBuyer ? (
            <View style={styles.badge}>
              <Ionicons name="trending-up-outline" size={9} color={colors.gold} />
              <Text style={styles.badgeTxt}>Repeat collector</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.gold },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13.5, fontWeight: '800', color: colors.textPrimary, lineHeight: 18 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  price: { fontSize: 15, fontWeight: '800', color: colors.gold, marginTop: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  badgeTxt: { fontSize: 9.5, fontWeight: '800', color: colors.gold },
});
