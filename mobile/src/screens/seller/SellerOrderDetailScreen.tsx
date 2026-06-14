import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, type ReactNode } from 'react';
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
  fetchSellerSalesOrderById,
  type SellerSalesOrderDetail,
} from '../../api/sellerSalesRepository';
import { PremiumVaultButton } from '../../components/product/PremiumVaultButton';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useAuth } from '../../auth/AuthContext';
import { useStaleWhileRevalidate } from '../../hooks/useStaleWhileRevalidate';
import { openWebCommerceUrl, webSellerSalesUrl } from '../../lib/openWebCommerce';
import {
  estimatePlatformFeeUsd,
  estimateStripeProcessingFeeUsd,
  formatSellerPayoutStatus,
  STRIPE_FEE_RATE_LABEL,
  VAULTED_FEE_RATE_LABEL,
  VAULTED_PLATFORM_FEE_PERCENT,
} from '../../lib/sellerOrderPayoutDisplay';
import { resolveSellerOrderTotals } from '../../lib/sellerOrderTotals';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerOrderDetail'>;

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function fulfillmentLabel(order: SellerSalesOrderDetail) {
  const fs = order.fulfillmentStatus ?? '';
  if (fs === 'label_created') return 'Label ready';
  if (fs === 'in_transit') return 'In transit';
  if (fs === 'out_for_delivery') return 'Out for delivery';
  if (fs === 'delivered') return 'Delivered';
  if (order.status === 'shipped') return 'Shipped';
  if (order.paymentStatus === 'paid') return 'Ready to ship';
  return order.status.replace(/_/g, ' ');
}

function textOrDash(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

export function SellerOrderDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const loadOrder = useCallback(async () => {
    if (!session?.access_token) return null;
    const row = await fetchSellerSalesOrderById(session.access_token, route.params.orderId);
    if (!row) throw new Error('Order not found.');
    return row;
  }, [route.params.orderId, session?.access_token]);

  const { data: detail, error, reload, showBlockingLoader } = useStaleWhileRevalidate(loadOrder);

  useEffect(() => {
    void reload();
  }, [reload]);

  const listingImage = detail?.listing.images?.[0]?.url;
  const needsLabel =
    detail?.paymentStatus === 'paid' && !detail.shippoTransactionId && !detail.labelUrl;

  const orderTotals = detail ? resolveSellerOrderTotals(detail) : null;
  const saleAmountUsd = orderTotals?.itemPriceUsd ?? 0;
  const vaultedFeePercent = detail?.platformFeePercent ?? VAULTED_PLATFORM_FEE_PERCENT;
  const platformFeeUsd =
    detail?.platformFeeEstimateUsd ?? estimatePlatformFeeUsd(saleAmountUsd, vaultedFeePercent);
  const stripeFeeUsd =
    detail?.stripeProcessingFeeEstimateUsd ??
    (orderTotals ? estimateStripeProcessingFeeUsd(orderTotals.totalUsd) : 0);
  const payoutStatus = detail ? formatSellerPayoutStatus(detail.payoutStatus) : null;

  const openSellerStudio = () => {
    const url = webSellerSalesUrl();
    if (!url) {
      Alert.alert('Configuration', 'Set EXPO_PUBLIC_SITE_URL to open Seller Studio in your browser.');
      return;
    }
    void openWebCommerceUrl(url);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Order detail" subtitle="Seller view" onBack={() => navigation.goBack()} />

      {showBlockingLoader ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : error || !detail ? (
        <Text style={styles.empty}>{error ?? 'Order not found.'}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.desktopCard}>
            <Ionicons name="desktop-outline" size={20} color={colors.gold} />
            <Text style={styles.desktopTxt}>
              {needsLabel
                ? 'Print shipping labels from Seller Studio on getvaulted.com (desktop). Mobile shows order details only.'
                : 'Shipping labels are managed on Seller Studio (desktop). Tracking and payout details are shown here.'}
            </Text>
          </View>

          <View style={styles.itemCard}>
            {listingImage ? (
              <Image source={{ uri: listingImage }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{detail.listing.title}</Text>
              <Text style={styles.itemPrice}>{formatMoney(orderTotals?.totalUsd ?? detail.totalUsd)}</Text>
              <Text style={styles.itemMeta}>
                Order {detail.id.slice(0, 8).toUpperCase()} · {formatDate(detail.createdAt)}
              </Text>
            </View>
          </View>

          <Section title="Buyer">
            <Text style={styles.line}>
              {detail.buyer.username ? `@${detail.buyer.username}` : 'Buyer on file'}
            </Text>
          </Section>

          <Section title="Status">
            <Text style={styles.status}>{fulfillmentLabel(detail)}</Text>
            <Text style={styles.line}>Payment {detail.paymentStatus.replace(/_/g, ' ')}</Text>
            <Text style={styles.line}>Fulfillment {detail.fulfillmentStatus.replace(/_/g, ' ')}</Text>
            {detail.sellerNextAction ? (
              <Text style={styles.nextAction}>{detail.sellerNextAction}</Text>
            ) : null}
          </Section>

          <Section title="Ship to">
            <Text style={styles.lineStrong}>{textOrDash(detail.shipRecipientName)}</Text>
            <Text style={styles.line}>{textOrDash(detail.shipAddress)}</Text>
            <Text style={styles.line}>
              {[detail.shipCity, detail.shipState, detail.shipZip].filter(Boolean).join(', ') || '—'}
            </Text>
            <Text style={styles.line}>{textOrDash(detail.shipCountry)}</Text>
          </Section>

          <Section title="Shipping">
            {detail.carrier || detail.service ? (
              <Text style={styles.line}>
                {[detail.carrier, detail.service].filter(Boolean).join(' · ')}
              </Text>
            ) : (
              <Text style={styles.line}>Carrier not assigned yet.</Text>
            )}
            {detail.trackingNumber ? (
              <Text style={styles.line}>Tracking {detail.trackingNumber}</Text>
            ) : (
              <Text style={styles.line}>No tracking number yet.</Text>
            )}
            {detail.trackingUrl ? (
              <Pressable onPress={() => void Linking.openURL(detail.trackingUrl!)}>
                <Text style={styles.link}>Open carrier tracking</Text>
              </Pressable>
            ) : null}
            {detail.labelUrl ? (
              <Pressable onPress={() => void Linking.openURL(detail.labelUrl!)}>
                <Text style={styles.link}>View label PDF</Text>
              </Pressable>
            ) : null}
          </Section>

          <Section title="Order totals">
            <Text style={styles.line}>Item {formatMoney(orderTotals?.itemPriceUsd ?? 0)}</Text>
            <Text style={styles.line}>Shipping {formatMoney(orderTotals?.shippingPriceUsd ?? 0)}</Text>
            <Text style={styles.line}>Tax {formatMoney(orderTotals?.taxUsd ?? 0)}</Text>
            <Text style={styles.lineStrong}>Total {formatMoney(orderTotals?.totalUsd ?? 0)}</Text>
          </Section>

          <Section title="Payout">
            <Text style={styles.lineStrong}>
              Status: {payoutStatus?.title ?? '—'}
            </Text>
            {payoutStatus?.detail ? (
              <Text style={styles.line}>{payoutStatus.detail}</Text>
            ) : null}
            <Text style={styles.line}>
              Get Vaulted fee {formatMoney(platformFeeUsd)} ({VAULTED_FEE_RATE_LABEL})
            </Text>
            <Text style={styles.line}>
              Stripe fee {formatMoney(stripeFeeUsd)} ({STRIPE_FEE_RATE_LABEL})
            </Text>
            {detail.payoutReserveAmountCents > 0 ? (
              <Text style={styles.line}>
                Reserve hold {formatMoney(detail.payoutReserveAmountCents / 100)}
              </Text>
            ) : null}
            <Text style={styles.lineStrong}>Est. payout {formatMoney(detail.payoutEstimateUsd ?? 0)}</Text>
            {detail.payoutHoldUntil ? (
              <Text style={styles.line}>Hold until {formatDate(detail.payoutHoldUntil)}</Text>
            ) : null}
            {detail.payoutBlockedReason ? (
              <Text style={styles.warnLine}>{detail.payoutBlockedReason}</Text>
            ) : null}
            {detail.deliveryConfirmedAt ? (
              <Text style={styles.line}>Delivered {formatDate(detail.deliveryConfirmedAt)}</Text>
            ) : null}
          </Section>

          <PremiumVaultButton
            label="Open Seller Studio"
            icon="open-outline"
            variant="primary"
            onPress={openSellerStudio}
          />
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionKicker}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  body: { padding: spacing.lg, gap: spacing.md },
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
  itemCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumb: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.border },
  thumbEmpty: { backgroundColor: `${colors.gold}18` },
  itemTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  itemPrice: { color: colors.gold, fontSize: 18, fontWeight: '700', marginTop: 4 },
  itemMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  section: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  sectionKicker: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  status: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  nextAction: { color: colors.gold, fontSize: 13, marginTop: 4 },
  line: { color: colors.textSecondary, fontSize: 14 },
  lineStrong: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  warnLine: { color: '#FF8A80', fontSize: 13 },
  link: { color: colors.gold, fontSize: 14, fontWeight: '600', marginTop: 4 },
});
