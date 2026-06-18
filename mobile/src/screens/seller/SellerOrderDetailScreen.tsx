import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchSellerSalesOrderDetailBundle,
  regenerateSellerShippingLabel,
  repairSellerShippingLabel,
  type SellerOrderActivityRow,
  type SellerSalesOrderDetail,
} from '../../api/sellerSalesRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { SellerOrderCompactTimeline } from '../../components/seller/SellerOrderCompactTimeline';
import { OrderRefundRequestSection } from '../../components/orders/OrderRefundRequestSection';
import { SellerShippingLabelPanel } from '../../components/seller/SellerShippingLabelPanel';
import { useAuth } from '../../auth/AuthContext';
import { useStaleWhileRevalidate } from '../../hooks/useStaleWhileRevalidate';
import {
  buildSellerTimelineCompact,
  resolveSellerOrderHeadline,
  resolveSellerQuickActions,
  type SellerQuickActionKind,
} from '../../lib/sellerOrderDetailDisplay';
import {
  estimatePlatformFeeUsd,
  estimateStripeProcessingFeeUsd,
  formatSellerPayoutStatus,
  STRIPE_FEE_RATE_LABEL,
  VAULTED_FEE_RATE_LABEL,
  VAULTED_PLATFORM_FEE_PERCENT,
} from '../../lib/sellerOrderPayoutDisplay';
import { orderHasPurchasedLabel } from '../../lib/sellerShippingLabelState';
import { resolveSellerOrderTotals } from '../../lib/sellerOrderTotals';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerOrderDetail'>;

type OrderBundle = {
  order: SellerSalesOrderDetail;
  activityLog: SellerOrderActivityRow[];
};

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatActivityWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function textOrDash(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

function StatusPill({ label, tone }: { label: string; tone: 'gold' | 'green' | 'muted' | 'sky' }) {
  const toneStyle =
    tone === 'gold'
      ? styles.pillGold
      : tone === 'green'
        ? styles.pillGreen
        : tone === 'sky'
          ? styles.pillSky
          : styles.pillMuted;
  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={styles.pillTxt}>{label}</Text>
    </View>
  );
}

export function SellerOrderDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [labelActionBusy, setLabelActionBusy] = useState<'repair' | 'regenerate' | null>(null);

  const loadOrder = useCallback(async (): Promise<OrderBundle | null> => {
    if (!session?.access_token) return null;
    const bundle = await fetchSellerSalesOrderDetailBundle(session.access_token, route.params.orderId);
    if (!bundle) throw new Error('Order not found.');
    return bundle;
  }, [route.params.orderId, session?.access_token]);

  const { data: bundle, error, reload, showBlockingLoader } = useStaleWhileRevalidate(loadOrder);

  useEffect(() => {
    void reload();
  }, [reload]);

  const detail = bundle?.order;
  const activityLog = bundle?.activityLog ?? [];
  const listingImage = detail?.listing.images?.[0]?.url;
  const needsLabel = detail?.paymentStatus === 'paid' && !orderHasPurchasedLabel(detail);
  const hasLabelPanel = detail ? orderHasPurchasedLabel(detail) : false;

  const orderTotals = detail ? resolveSellerOrderTotals(detail) : null;
  const saleAmountUsd = orderTotals?.itemPriceUsd ?? 0;
  const vaultedFeePercent = detail?.platformFeePercent ?? VAULTED_PLATFORM_FEE_PERCENT;
  const platformFeeUsd =
    detail?.platformFeeEstimateUsd ?? estimatePlatformFeeUsd(saleAmountUsd, vaultedFeePercent);
  const stripeFeeUsd =
    detail?.stripeProcessingFeeEstimateUsd ??
    (orderTotals ? estimateStripeProcessingFeeUsd(orderTotals.totalUsd) : 0);
  const payoutStatus = detail ? formatSellerPayoutStatus(detail.payoutStatus) : null;
  const headline = detail ? resolveSellerOrderHeadline(detail) : null;
  const quickActions = detail ? resolveSellerQuickActions(detail) : [];
  const timeline = detail ? buildSellerTimelineCompact(detail) : [];

  const repairLabel = async () => {
    if (!session?.access_token || !detail) return;
    setLabelActionBusy('repair');
    try {
      const result = await repairSellerShippingLabel(session.access_token, detail.id);
      if (!result.ok) {
        Alert.alert('Retry lookup', result.error);
        return;
      }
      await reload();
    } finally {
      setLabelActionBusy(null);
    }
  };

  const regenerateLabel = () => {
    if (!session?.access_token || !detail) return;
    Alert.alert(
      'Regenerate label',
      'Purchase a new shipping label? Shippo may charge again if the original label cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setLabelActionBusy('regenerate');
              try {
                const result = await regenerateSellerShippingLabel(session.access_token!, detail.id);
                if (!result.ok) {
                  Alert.alert('Regenerate label', result.error);
                  return;
                }
                await reload();
              } finally {
                setLabelActionBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  const runQuickAction = async (kind: SellerQuickActionKind) => {
    if (!detail) return;
    if (kind === 'print_label' || kind === 'download_label') {
      if (detail.labelUrl?.trim()) void Linking.openURL(detail.labelUrl);
      return;
    }
    if (kind === 'copy_tracking' && detail.trackingNumber?.trim()) {
      await Clipboard.setStringAsync(detail.trackingNumber.trim());
      Alert.alert('Copied', 'Tracking number copied.');
      return;
    }
    if (kind === 'open_tracking' && detail.trackingUrl?.trim()) {
      void Linking.openURL(detail.trackingUrl);
      return;
    }
    if (kind === 'retrieve_label') return repairLabel();
    if (kind === 'regenerate_label') return regenerateLabel();
  };

  const primaryAction = quickActions.find((a) => a.primary) ?? quickActions[0];
  const stickyBusy = labelActionBusy !== null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Order detail" subtitle="Seller HQ" onBack={() => navigation.goBack()} />

      {showBlockingLoader ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : error || !detail ? (
        <Text style={styles.empty}>{error ?? 'Order not found.'}</Text>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingBottom: insets.bottom + (primaryAction ? 88 : spacing.xl) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Summary header */}
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                {listingImage ? (
                  <Image source={{ uri: listingImage }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroKicker}>Seller HQ · Order</Text>
                  <Text style={styles.heroTitle}>{detail.listing.title}</Text>
                  <Text style={styles.heroMeta}>
                    {detail.id.slice(0, 8).toUpperCase()} · @{detail.buyer.username ?? 'buyer'} ·{' '}
                    {formatDate(detail.createdAt)}
                  </Text>
                  <View style={styles.pillRow}>
                    <StatusPill
                      label={detail.paymentStatus.replace(/_/g, ' ')}
                      tone={detail.paymentStatus === 'paid' ? 'green' : 'muted'}
                    />
                    <StatusPill
                      label={detail.fulfillmentStatus.replace(/_/g, ' ')}
                      tone={
                        detail.fulfillmentStatus === 'delivered'
                          ? 'green'
                          : detail.fulfillmentStatus === 'label_created'
                            ? 'sky'
                            : 'muted'
                      }
                    />
                  </View>
                </View>
              </View>

              <View style={styles.heroTotals}>
                <View>
                  <Text style={styles.heroTotalsLabel}>Order total</Text>
                  <Text style={styles.heroTotal}>{formatMoney(orderTotals?.totalUsd ?? detail.totalUsd)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.heroTotalsLabel}>Est. payout</Text>
                  <Text style={styles.heroPayout}>{formatMoney(detail.payoutEstimateUsd ?? 0)}</Text>
                </View>
              </View>

              {headline ? (
                <View style={styles.heroNext}>
                  <Text style={styles.heroNextTitle}>{headline.headline}</Text>
                  <Text style={styles.heroNextSub}>{headline.subheadline}</Text>
                </View>
              ) : null}
            </View>

            {needsLabel ? (
              <View style={styles.desktopCard}>
                <Ionicons name="desktop-outline" size={20} color={colors.gold} />
                <Text style={styles.desktopTxt}>
                  Create labels in Seller Studio on desktop. Print and reprint labels here after purchase.
                </Text>
              </View>
            ) : null}

            {hasLabelPanel ? (
              <SellerShippingLabelPanel
                orderId={detail.id}
                carrier={detail.carrier}
                service={detail.service}
                trackingNumber={detail.trackingNumber}
                trackingUrl={detail.trackingUrl}
                labelUrl={detail.labelUrl}
                shippoTransactionId={detail.shippoTransactionId}
                labelCreatedAt={detail.labelCreatedAt}
                fulfillmentStatus={detail.fulfillmentStatus}
                shippingStatus={detail.shippingStatus}
                onRepairLabel={repairLabel}
                repairLabelBusy={labelActionBusy === 'repair'}
                onRegenerateLabel={regenerateLabel}
                regenerateLabelBusy={labelActionBusy === 'regenerate'}
              />
            ) : null}

            <SellerOrderCompactTimeline steps={timeline} />

            {detail.liveShowId && (detail.paymentStatus === 'paid' || detail.paymentStatus === 'refunded') ? (
              <OrderRefundRequestSection
                accessToken={session?.access_token}
                orderId={detail.id}
                role="seller"
              />
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardKicker}>Ship to</Text>
              <Text style={styles.lineStrong}>{textOrDash(detail.shipRecipientName)}</Text>
              <Text style={styles.line}>{textOrDash(detail.shipAddress)}</Text>
              <Text style={styles.line}>
                {[detail.shipCity, detail.shipState, detail.shipZip].filter(Boolean).join(', ') || '—'}
              </Text>
              <Text style={styles.line}>{textOrDash(detail.shipCountry)}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardKicker}>Buyer</Text>
              <Text style={styles.lineStrong}>
                {detail.buyer.username ? `@${detail.buyer.username}` : 'Buyer on file'}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardKicker}>Order totals</Text>
              <MoneyLine label="Item" value={formatMoney(orderTotals?.itemPriceUsd ?? 0)} />
              <MoneyLine label="Shipping" value={formatMoney(orderTotals?.shippingPriceUsd ?? 0)} />
              {(orderTotals?.taxUsd ?? 0) > 0 ? (
                <MoneyLine label="Tax" value={formatMoney(orderTotals?.taxUsd ?? 0)} />
              ) : null}
              <View style={styles.divider} />
              <MoneyLine label="Total" value={formatMoney(orderTotals?.totalUsd ?? 0)} strong accent />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardKicker}>Your payout</Text>
              <Text style={styles.lineStrong}>Status: {payoutStatus?.title ?? '—'}</Text>
              {payoutStatus?.detail ? <Text style={styles.line}>{payoutStatus.detail}</Text> : null}
              <MoneyLine label={`Get Vaulted (${VAULTED_FEE_RATE_LABEL})`} value={`−${formatMoney(platformFeeUsd)}`} />
              <MoneyLine label={`Stripe (${STRIPE_FEE_RATE_LABEL})`} value={`−${formatMoney(stripeFeeUsd)}`} />
              <View style={styles.divider} />
              <MoneyLine label="Est. payout" value={formatMoney(detail.payoutEstimateUsd ?? 0)} strong accent />
            </View>

            {activityLog.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardKicker}>Activity</Text>
                {activityLog.map((ev, i) => (
                  <View key={ev.id} style={[styles.activityRow, i > 0 && styles.activityBorder]}>
                    <View style={styles.activityDot} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.activityTop}>
                        <Text style={styles.activityTitle}>{ev.title}</Text>
                        <Text style={styles.activityWhen}>{formatActivityWhen(ev.createdAt)}</Text>
                      </View>
                      <Text style={styles.activityBody}>{ev.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {primaryAction ? (
            <View style={[styles.stickyBar, { paddingBottom: insets.bottom + spacing.sm }]}>
              {quickActions.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickyActions}>
                  {quickActions.map((action) => (
                    <Pressable
                      key={action.kind}
                      style={[styles.stickyBtn, action.primary && styles.stickyBtnPrimary, stickyBusy && styles.btnDisabled]}
                      disabled={stickyBusy}
                      onPress={() => void runQuickAction(action.kind)}
                    >
                      <Text style={[styles.stickyBtnTxt, action.primary && styles.stickyBtnTxtPrimary]}>
                        {action.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <Pressable
                  style={[styles.stickyPrimary, stickyBusy && styles.btnDisabled]}
                  disabled={stickyBusy}
                  onPress={() => void runQuickAction(primaryAction.kind)}
                >
                  {stickyBusy ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text style={styles.stickyPrimaryTxt}>{primaryAction.label}</Text>
                  )}
                </Pressable>
              )}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function MoneyLine({
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
      <Text style={styles.line}>{label}</Text>
      <Text style={[strong ? styles.lineStrong : styles.line, accent && styles.accent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  body: { padding: spacing.lg, gap: spacing.md },
  hero: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  thumb: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.border },
  thumbEmpty: { backgroundColor: `${colors.gold}18` },
  heroKicker: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 2, lineHeight: 22 },
  heroMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  pill: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  pillGold: { borderColor: `${colors.gold}55`, backgroundColor: `${colors.gold}15` },
  pillGreen: { borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.12)' },
  pillSky: { borderColor: 'rgba(56,189,248,0.35)', backgroundColor: 'rgba(56,189,248,0.12)' },
  pillMuted: { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  pillTxt: { color: colors.textSecondary, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  heroTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  heroTotalsLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  heroTotal: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 2 },
  heroPayout: { color: colors.gold, fontSize: 18, fontWeight: '800', marginTop: 2 },
  heroNext: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: `${colors.gold}08`,
  },
  heroNextTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  heroNextSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  desktopCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: `${colors.gold}44`,
    backgroundColor: `${colors.gold}12`,
  },
  desktopTxt: { flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  card: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  cardKicker: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  line: { color: colors.textSecondary, fontSize: 14 },
  lineStrong: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  accent: { color: colors.gold, fontWeight: '700' },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  activityRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  activityBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gold,
    marginTop: 6,
  },
  activityTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  activityTitle: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  activityWhen: { color: colors.textMuted, fontSize: 10 },
  activityBody: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: `${colors.background}F2`,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  stickyPrimary: {
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyPrimaryTxt: { color: colors.background, fontSize: 14, fontWeight: '800' },
  stickyActions: { flexDirection: 'row', gap: spacing.sm, paddingBottom: 2 },
  stickyBtn: {
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyBtnPrimary: { borderColor: colors.gold, backgroundColor: `${colors.gold}18` },
  stickyBtnTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  stickyBtnTxtPrimary: { color: colors.gold },
  btnDisabled: { opacity: 0.5 },
});
