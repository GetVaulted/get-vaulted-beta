import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BuyerOrderBucket } from '../../api/ordersRepository';
import { isOrderCompleteForReview } from '../../api/ordersRepository';
import { BuyerOrderCard } from '../../components/orders/BuyerOrderCard';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useAuth } from '../../auth/AuthContext';
import { useBuyerOrders } from '../../hooks/useBuyerOrders';
import { openWriteReview } from '../../navigation/openPlatform';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyerOrders'>;

const SEGMENTS: { key: BuyerOrderBucket; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
  { key: 'canceled', label: 'Canceled' },
];

export function BuyerOrdersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [segment, setSegment] = useState<BuyerOrderBucket>('active');
  const { byBucket, reviewedMap, loading, refresh } = useBuyerOrders(user?.id);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const rows = useMemo(() => byBucket(segment), [byBucket, segment]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="My orders"
        subtitle="Vault purchases · tracking · protection"
        onBack={() => navigation.goBack()}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segments}>
        {SEGMENTS.map((s) => {
          const active = segment === s.key;
          const count = byBucket(s.key).length;
          return (
            <Pressable
              key={s.key}
              onPress={() => setSegment(s.key)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{s.label}</Text>
              {count > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.gold} style={styles.loader} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No {segment} orders</Text>
          <Text style={styles.emptySub}>
            {segment === 'active'
              ? 'When you buy from the vault, live tracking and protection status appear here.'
              : 'Completed vault transactions show here with review and dispute shortcuts.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {rows.map((order) => (
            <BuyerOrderCard
              key={order.id}
              order={order}
              reviewed={Boolean(reviewedMap[order.id])}
              showReviewCta={isOrderCompleteForReview(order.status)}
              onPress={() => navigation.navigate('BuyerOrderDetail', { orderId: order.id })}
              onLeaveReview={() =>
                openWriteReview(
                  {
                    reviewType: 'buyer_to_seller',
                    referenceId: order.id,
                    subjectUserId: order.sellerId,
                    subjectDisplayName: order.sellerUsername ?? undefined,
                  },
                  navigation,
                )
              }
            />
          ))}
          <Text style={styles.tradeNote}>Trade orders will appear in a dedicated lane soon.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  segments: { gap: spacing.sm, paddingBottom: spacing.md },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentActive: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  segmentLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  segmentLabelActive: { color: colors.gold },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#0a0a0a' },
  loader: { marginTop: spacing.xl },
  list: { gap: spacing.md, paddingBottom: spacing.xxxl },
  empty: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  emptySub: { marginTop: 8, fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  tradeNote: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});
