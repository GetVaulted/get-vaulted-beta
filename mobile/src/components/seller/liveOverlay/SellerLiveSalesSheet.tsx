import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  HostPaymentFailureRow,
  HostRecentSaleRow,
  HostSellerShowSummary,
} from '../../../api/liveHostRepository';
import { createOffPlatformPlatformFeeCheckout } from '../../../api/liveRoomControlRepository';
import { cancelHostPaymentFailure } from '../../../api/livePaymentFailureRepository';
import { openStripeCheckoutSession } from '../../../lib/openStripeCheckoutSession';
import { colors, radii, spacing } from '../../../theme';

function fmtUsd(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFeePercent(pct: number) {
  return `${pct.toFixed(2).replace(/\.00$/, '')}%`;
}

function centsToUsd(cents: number) {
  return Math.round(cents) / 100;
}

function kindLabel(kind: HostRecentSaleRow['kind'], statusLabel?: string) {
  if (statusLabel === 'Giveaway' || statusLabel?.startsWith('Giveaway')) return 'giveaway';
  if (kind === 'order') return 'order';
  if (kind === 'variant_purchase') return 'spot';
  return 'spot';
}

function toneStyle(tone: HostRecentSaleRow['paymentTone']) {
  if (tone === 'paid') {
    return { wrap: styles.badgePaid, text: styles.badgePaidTxt };
  }
  if (tone === 'retry') {
    return { wrap: styles.badgeRetry, text: styles.badgeRetryTxt };
  }
  return { wrap: styles.badgePending, text: styles.badgePendingTxt };
}

type Props = {
  visible: boolean;
  onClose: () => void;
  accessToken: string;
  roomId: string;
  recentSales: HostRecentSaleRow[];
  sellerSummary?: HostSellerShowSummary | null;
  paymentFailures: HostPaymentFailureRow[];
  onRefresh: () => Promise<void>;
  onToast?: (msg: string) => void;
};

export function SellerLiveSalesSheet({
  visible,
  onClose,
  accessToken,
  roomId,
  recentSales,
  sellerSummary,
  paymentFailures,
  onRefresh,
  onToast,
}: Props) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [feeBusyId, setFeeBusyId] = useState<string | null>(null);

  const needsAttention = useMemo(
    () =>
      paymentFailures.length +
      recentSales.filter((r) => r.paymentTone === 'retry' || (r.platformFeeDueUsd ?? 0) > 0).length,
    [paymentFailures.length, recentSales],
  );

  const onPayPlatformFee = useCallback(
    async (row: HostRecentSaleRow) => {
      const purchaseId = row.purchaseId?.trim();
      if (!purchaseId || feeBusyId) return;
      setFeeBusyId(row.id);
      try {
        const checkout = await createOffPlatformPlatformFeeCheckout({
          accessToken,
          roomId,
          purchaseId,
        });
        if (checkout.alreadyPaid) {
          onToast?.('Platform fee already paid');
          await onRefresh();
          return;
        }
        if (!checkout.url) throw new Error('Could not start fee checkout.');
        await openStripeCheckoutSession(checkout.url);
        await onRefresh();
      } catch (e) {
        onToast?.(e instanceof Error ? e.message : 'Could not open fee payment.');
      } finally {
        setFeeBusyId(null);
      }
    },
    [accessToken, feeBusyId, onRefresh, onToast, roomId],
  );

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const onCancelRetry = useCallback(
    async (failureId: string) => {
      setCancelBusyId(failureId);
      try {
        const res = await cancelHostPaymentFailure({ accessToken, roomId, failureId });
        if (!res.ok) {
          onToast?.(res.error);
          return;
        }
        onToast?.('Payment retry cancelled.');
        await onRefresh();
      } catch (e) {
        onToast?.(e instanceof Error ? e.message : 'Could not cancel retry.');
      } finally {
        setCancelBusyId(null);
      }
    },
    [accessToken, onRefresh, onToast, roomId],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sales" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Live sales</Text>
              {needsAttention > 0 ? (
                <View style={styles.attentionPill}>
                  <Text style={styles.attentionTxt}>{needsAttention} need attention</Text>
                </View>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onPullRefresh()} tintColor={colors.gold} />}
            keyboardShouldPersistTaps="handled"
          >
            {paymentFailures.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Show paused — payment due</Text>
                <Text style={styles.sectionHint}>
                  Start the next auction or buy now after the buyer fixes payment, or cancel the retry.
                </Text>
                {paymentFailures.map((f) => (
                  <View key={f.id} style={styles.failureRow}>
                    <View style={styles.failureBody}>
                      <Text style={styles.failureUser} numberOfLines={1}>
                        @{f.buyerUsername ?? 'buyer'}
                      </Text>
                      {f.itemTitle ? (
                        <Text style={styles.failureItem} numberOfLines={1}>
                          {f.itemTitle}
                        </Text>
                      ) : null}
                      <Text style={styles.failureAmount}>{fmtUsd(f.amountUsd)}</Text>
                      {f.failureReason ? (
                        <Text style={styles.failureReason} numberOfLines={2}>
                          {f.failureReason}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      style={[styles.cancelBtn, cancelBusyId === f.id && styles.disabled]}
                      onPress={() => void onCancelRetry(f.id)}
                      disabled={cancelBusyId === f.id}
                    >
                      {cancelBusyId === f.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.cancelTxt}>Cancel retry</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Show sales</Text>
              <Text style={styles.showSalesAmount}>
                {fmtUsd(centsToUsd(sellerSummary?.grossShowSalesCents ?? 0))}
              </Text>
              <Text style={styles.sectionHint}>
                {sellerSummary && sellerSummary.paidOrderCount > 0
                  ? `${sellerSummary.paidOrderCount} paid sale${sellerSummary.paidOrderCount === 1 ? '' : 's'}`
                  : 'Total paid sales during this show'}
              </Text>
            </View>

            {sellerSummary ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Current platform fee tier</Text>
                <Text style={styles.feeTierPercent}>{fmtFeePercent(sellerSummary.currentFeeRatePercent)}</Text>
                <Text style={styles.sectionHint}>
                  Next sale fee: {fmtFeePercent(sellerSummary.currentFeeRatePercent)}
                  {sellerSummary.amountUntilNextTierCents != null && sellerSummary.nextTierFeePercent != null
                    ? ` · ${fmtUsd(centsToUsd(sellerSummary.amountUntilNextTierCents))} until ${fmtFeePercent(sellerSummary.nextTierFeePercent)}`
                    : ' · top tier unlocked'}
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(100, Math.max(0, sellerSummary.tierProgressPercent))}%` },
                    ]}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent sales</Text>
                <Text style={styles.sectionMeta}>{recentSales.length ? `${recentSales.length} shown` : ''}</Text>
              </View>
              {recentSales.length === 0 ? (
                <Text style={styles.empty}>No payments on this show yet.</Text>
              ) : (
                recentSales.map((r) => {
                  const badge = toneStyle(r.paymentTone);
                  const feeDue = (r.platformFeeDueUsd ?? 0) > 0;
                  return (
                    <View key={r.id} style={styles.saleRow}>
                      <View style={styles.saleBody}>
                        <Text style={styles.saleUser} numberOfLines={1}>
                          @{r.buyerUsername}{' '}
                          <Text style={styles.saleKind}>· {kindLabel(r.kind, r.statusLabel)}</Text>
                        </Text>
                        {r.spotLabel ? (
                          <Text style={styles.spotLabel} numberOfLines={1}>
                            {r.spotLabel}
                          </Text>
                        ) : null}
                        <Text style={styles.saleAmount}>{fmtUsd(r.amountUsd)}</Text>
                        {feeDue ? (
                          <Pressable
                            style={[styles.feePayBtn, feeBusyId === r.id && styles.feePayBtnBusy]}
                            disabled={feeBusyId === r.id}
                            onPress={() => void onPayPlatformFee(r)}
                          >
                            {feeBusyId === r.id ? (
                              <ActivityIndicator color="#111" size="small" />
                            ) : (
                              <Text style={styles.feePayBtnTxt}>
                                Pay fee {fmtUsd(r.platformFeeDueUsd!)}
                              </Text>
                            )}
                          </Pressable>
                        ) : null}
                      </View>
                      <View style={[styles.badge, badge.wrap]}>
                        <Text style={[styles.badgeTxt, badge.text]}>{r.statusLabel}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: '#0c0c0e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  attentionPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(244,63,94,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(244,63,94,0.35)',
  },
  attentionTxt: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fecdd3',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  section: { gap: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  showSalesAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ecfdf5',
    fontVariant: ['tabular-nums'],
  },
  feeTierPercent: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fef3c7',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.85)',
  },
  sectionHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 17,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  sectionMeta: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.28)',
    textTransform: 'uppercase',
  },
  empty: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    paddingVertical: spacing.md,
  },
  failureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(244,63,94,0.08)',
    padding: spacing.sm,
  },
  failureBody: { flex: 1, minWidth: 0 },
  failureUser: { fontSize: 12, fontWeight: '700', color: '#fff' },
  failureItem: { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  failureAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  failureReason: { fontSize: 10, color: '#fecdd3', marginTop: 4 },
  cancelBtn: {
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(244,63,94,0.35)',
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'uppercase',
  },
  disabled: { opacity: 0.55 },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  saleBody: { flex: 1, minWidth: 0 },
  saleUser: { fontSize: 12, fontWeight: '700', color: '#fff' },
  saleKind: { fontWeight: '400', color: 'rgba(255,255,255,0.45)' },
  spotLabel: { fontSize: 10, fontWeight: '700', color: colors.gold, marginTop: 2 },
  saleAmount: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  feePayBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 110,
    alignItems: 'center',
  },
  feePayBtnBusy: { opacity: 0.7 },
  feePayBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111',
  },
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeTxt: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
  badgePaid: { borderColor: 'rgba(52,211,153,0.4)', backgroundColor: 'rgba(6,78,59,0.45)' },
  badgePaidTxt: { color: '#a7f3d0' },
  badgeRetry: { borderColor: 'rgba(244,63,94,0.45)', backgroundColor: 'rgba(76,5,25,0.4)' },
  badgeRetryTxt: { color: '#fecdd3' },
  badgePending: { borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(69,26,3,0.35)' },
  badgePendingTxt: { color: '#fde68a' },
});
