import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BuyerOrder } from '../../api/ordersRepository';
import { VaultImage } from '../ui/VaultImage';
import { colors, radii, spacing } from '../../theme';

const THUMB = 64;
const AVATAR = 20;

function formatTotal(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function BuyerOrderCard({
  order,
  reviewed,
  showReviewCta,
  onPress,
  onLeaveReview,
}: {
  order: BuyerOrder;
  reviewed: boolean;
  showReviewCta: boolean;
  onPress: () => void;
  onLeaveReview: () => void;
}) {
  const reviewVisible = showReviewCta && !reviewed;
  const reviewDone = showReviewCta && reviewed;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
      >
      <View style={styles.top}>
        {order.thumbnailUrl ? (
          <VaultImage uri={order.thumbnailUrl} width={THUMB} height={THUMB} borderRadius={radii.md} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="cube-outline" size={22} color={colors.gold} />
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {order.listingTitle}
          </Text>
          <View style={styles.sellerRow}>
            {order.sellerAvatarUrl ? (
              <VaultImage uri={order.sellerAvatarUrl} width={AVATAR} height={AVATAR} borderRadius={AVATAR / 2} priority="low" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={10} color={colors.textMuted} />
              </View>
            )}
            <Text style={styles.seller}>@{order.sellerUsername ?? 'seller'}</Text>
            <Text style={styles.total}>{formatTotal(order.totalCents)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{order.statusLabel}</Text>
        </View>
        <View style={[styles.pill, styles.pillMuted]}>
          <Ionicons name="navigate-outline" size={11} color={colors.gold} />
          <Text style={styles.pillMutedText} numberOfLines={1}>
            {order.trackingLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.eta}>{order.estimatedDelivery}</Text>
      <View style={styles.protection}>
        <Ionicons name="shield-checkmark" size={14} color={colors.gold} />
        <Text style={styles.protectionText}>{order.protectionLabel}</Text>
      </View>

      </Pressable>
      {reviewVisible ? (
        <Pressable onPress={onLeaveReview} style={({ pressed }) => [styles.reviewBtn, pressed && styles.pressed]}>
          <Ionicons name="star" size={16} color="#0a0a0a" />
          <Text style={styles.reviewBtnText}>Leave review</Text>
          <Text style={styles.reviewHint}>Builds collector trust</Text>
        </Pressable>
      ) : null}
      {reviewDone ? (
        <View style={styles.reviewDone}>
          <Ionicons name="checkmark-circle" size={16} color={colors.gold} />
          <Text style={styles.reviewDoneText}>Review submitted · thanks for strengthening the vault</Text>
        </View>
      ) : null}
    </View>
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
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.md, backgroundColor: colors.surface },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1, minWidth: 0, gap: 6 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, lineHeight: 20 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  seller: { flex: 1, fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  total: { fontSize: 13, fontWeight: '800', color: colors.gold },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  pillText: { fontSize: 11, fontWeight: '800', color: colors.gold, textTransform: 'capitalize' },
  pillMuted: { backgroundColor: 'rgba(255,255,255,0.06)', maxWidth: '58%' },
  pillMutedText: { fontSize: 10, fontWeight: '700', color: colors.textMuted, flexShrink: 1 },
  eta: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  protection: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  protectionText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  reviewBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
  },
  reviewBtnText: { fontSize: 13, fontWeight: '900', color: '#0a0a0a' },
  reviewHint: { marginLeft: 'auto', fontSize: 10, fontWeight: '700', color: 'rgba(0,0,0,0.55)' },
  reviewDone: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  reviewDoneText: { flex: 1, fontSize: 11, color: colors.textMuted, fontWeight: '600', lineHeight: 15 },
});
