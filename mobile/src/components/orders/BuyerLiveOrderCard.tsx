import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BuyerLiveOrder } from '../../api/buyerLiveOrdersRepository';
import { VaultImage } from '../ui/VaultImage';
import { colors, radii, spacing } from '../../theme';

function formatTotal(amountUsd: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountUsd);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function toneStyle(tone: BuyerLiveOrder['paymentTone']) {
  if (tone === 'paid') return styles.pillPaid;
  if (tone === 'retry') return styles.pillRetry;
  return styles.pillPending;
}

export function BuyerLiveOrderCard({
  order,
  onPress,
}: {
  order: BuyerLiveOrder;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.top}>
        {order.thumbnailUrl ? (
          <VaultImage uri={order.thumbnailUrl} width={64} height={64} borderRadius={radii.md} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="radio-outline" size={22} color={colors.gold} />
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {order.title}
          </Text>
          <Text style={styles.show} numberOfLines={1}>
            {order.liveRoomTitle} · @{order.sellerUsername}
          </Text>
          {order.spotLabel ? (
            <Text style={styles.spot} numberOfLines={1}>
              {order.spotLabel}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.total}>{formatTotal(order.amountUsd)}</Text>
            <View style={[styles.pill, toneStyle(order.paymentTone)]}>
              <Text style={styles.pillText}>{order.statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.date}>{formatDate(order.occurredAt)}</Text>
        </View>
      </View>
      <Text style={styles.cta}>
        {order.orderId ? 'View order details' : order.kind === 'giveaway' ? 'Add shipping address' : 'Open show'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.22)',
    backgroundColor: 'rgba(8,10,14,0.95)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.92 },
  top: { flexDirection: 'row', gap: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.surface },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, lineHeight: 20 },
  show: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  spot: { fontSize: 13, fontWeight: '800', color: 'rgba(255,235,180,0.92)' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 2 },
  total: { fontSize: 13, fontWeight: '800', color: colors.gold },
  pill: {
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillPaid: { borderColor: 'rgba(52,211,153,0.35)', backgroundColor: 'rgba(6,78,59,0.35)' },
  pillPending: { borderColor: 'rgba(251,191,36,0.35)', backgroundColor: 'rgba(120,53,15,0.35)' },
  pillRetry: { borderColor: 'rgba(248,113,113,0.35)', backgroundColor: 'rgba(127,29,29,0.35)' },
  pillText: { fontSize: 10, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  date: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  cta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
