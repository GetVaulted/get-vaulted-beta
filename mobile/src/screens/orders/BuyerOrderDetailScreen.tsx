import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchBuyerOrderById, isOrderCompleteForReview } from '../../api/ordersRepository';
import { touchAuctionPaymentExpiries } from '../../api/touchAuctionPaymentExpiries';
import type { BuyerOrder } from '../../api/ordersRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { VaultImage } from '../../components/ui/VaultImage';
import { ReportButton } from '../../components/trust/ReportSheet';
import { OrderRefundRequestSection } from '../../components/orders/OrderRefundRequestSection';
import { useAuth } from '../../auth/AuthContext';
import {
  openContactSupport,
  openDispute,
  openUserProfile,
  openVaultComms,
  openWriteReview,
} from '../../navigation/openPlatform';
import { hasReviewedReference } from '../../platform/platformStore';
import type { RootStackParamList } from '../../navigation/types';
import { openWebCommerceUrl, webOrderPayUrl } from '../../lib/openWebCommerce';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyerOrderDetail'>;

const TRUST_STEPS = ['Paid · vault hold', 'Label & ship', 'In transit', 'Delivered', 'Complete'];

function formatTotal(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function stepIndex(status: string): number {
  if (status === 'pending_payment') return 0;
  if (status === 'paid') return 1;
  if (status === 'shipped') return 2;
  if (status === 'delivered') return 3;
  if (status === 'completed') return 4;
  if (status === 'disputed') return 2;
  return 1;
}

export function BuyerOrderDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const { orderId } = route.params;
  const [order, setOrder] = useState<BuyerOrder | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadedOnceRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user?.id) return;
    const silent = opts?.silent ?? loadedOnceRef.current;
    if (!silent) setLoading(true);
    try {
      void touchAuctionPaymentExpiries(session?.access_token);
      const row = await fetchBuyerOrderById(user.id, orderId, session?.access_token);
      setOrder(row);
      if (row && isOrderCompleteForReview(row.status)) {
        setReviewed(await hasReviewedReference(user.id, row.id, 'buyer_to_seller'));
      }
    } finally {
      loadedOnceRef.current = true;
      setLoading(false);
    }
  }, [orderId, session?.access_token, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeStep = order ? stepIndex(order.status) : 0;
  const canReview = order && isOrderCompleteForReview(order.status) && !reviewed;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Order detail" subtitle="Receipt · tracking · protection" onBack={() => navigation.goBack()} />
      {loading && !loadedOnceRef.current ? (
        <ActivityIndicator color={colors.gold} />
      ) : !order ? (
        <Text style={styles.muted}>Order not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            {order.thumbnailUrl ? (
              <VaultImage uri={order.thumbnailUrl} width={88} height={88} borderRadius={radii.lg} />
            ) : (
              <View style={[styles.heroImg, styles.heroFallback]}>
                <Ionicons name="cube-outline" size={32} color={colors.gold} />
              </View>
            )}
            <View style={styles.heroMeta}>
              <Text style={styles.heroTitle}>{order.listingTitle}</Text>
              <Text style={styles.heroTotal}>{formatTotal(order.totalCents)}</Text>
              <Pressable onPress={() => openUserProfile(order.sellerId, navigation)} style={styles.sellerLink}>
                <Text style={styles.sellerLinkText}>Seller · @{order.sellerUsername ?? 'vault'}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.gold} />
              </Pressable>
            </View>
          </View>

          <View style={styles.banner}>
            <Ionicons name="shield-checkmark" size={18} color={colors.gold} />
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>{order.protectionLabel}</Text>
              <Text style={styles.bannerSub}>
                Transaction protection stays active through delivery. Disputes route to vault support—not a generic
                ticket queue.
              </Text>
            </View>
          </View>

          <Text style={styles.section}>Shipping progress</Text>
          <View style={styles.timeline}>
            {TRUST_STEPS.map((label, i) => {
              const done = i <= activeStep;
              const current = i === activeStep;
              return (
                <View key={label} style={styles.step}>
                  <View style={[styles.dot, done && styles.dotDone, current && styles.dotCurrent]} />
                  <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{label}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.tracking}>{order.trackingLabel}</Text>
          <Text style={styles.eta}>{order.estimatedDelivery}</Text>

          <View style={styles.actions}>
            {order.status === 'pending_payment' ? (
              <ActionBtn
                icon="card-outline"
                label="Complete payment"
                highlight
                onPress={() => {
                  const url = webOrderPayUrl(order.id);
                  if (!url) {
                    Alert.alert('Configuration', 'Set EXPO_PUBLIC_SITE_URL to complete payment in your browser.');
                    return;
                  }
                  void openWebCommerceUrl(url);
                }}
              />
            ) : null}
            <ActionBtn
              icon="navigate-outline"
              label="Track package"
              disabled={!order.trackingUrl}
              onPress={() => order.trackingUrl && void Linking.openURL(order.trackingUrl)}
            />
            <ActionBtn icon="chatbubble-ellipses-outline" label="Contact seller" onPress={() => openVaultComms(navigation)} />
            <View style={styles.reportRow}>
              <ReportButton
                targetType="order"
                targetId={order.id}
                accessToken={session?.access_token}
                label="Report order issue"
              />
            </View>
            {canReview ? (
              <ActionBtn
                icon="star"
                label="Leave review"
                highlight
                onPress={() =>
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
            ) : null}
            {order && isOrderCompleteForReview(order.status) && reviewed ? (
              <View style={styles.reviewedRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.gold} />
                <Text style={styles.reviewedText}>Review submitted — trust contribution recorded</Text>
              </View>
            ) : null}
            <ActionBtn
              icon="warning-outline"
              label="Open dispute"
              onPress={() => openDispute({ contextType: 'order', referenceId: order.id }, navigation)}
            />
            <ActionBtn
              icon="headset-outline"
              label="Vault support"
              onPress={() =>
                openContactSupport({ category: 'order', referenceType: 'order', referenceId: order.id }, navigation)
              }
            />
          </View>

          {order.status !== 'pending_payment' && order.status !== 'cancelled' && order.status !== 'canceled' ? (
            <OrderRefundRequestSection
              accessToken={session?.access_token}
              orderId={order.id}
              role="buyer"
            />
          ) : null}

          <View style={styles.receipt}>
            <Text style={styles.receiptTitle}>Receipt</Text>
            <Text style={styles.receiptLine}>Order ID · {order.id.slice(0, 8)}…</Text>
            <Text style={styles.receiptLine}>Status · {order.statusLabel}</Text>
            <Text style={styles.receiptLine}>Placed · {new Date(order.createdAt).toLocaleString()}</Text>
            {order.carrier ? <Text style={styles.receiptLine}>Carrier · {order.carrier}</Text> : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  disabled,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        highlight && styles.actionHighlight,
        disabled && styles.actionDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={18} color={highlight ? '#0a0a0a' : colors.gold} />
      <Text style={[styles.actionLabel, highlight && styles.actionLabelHighlight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  muted: { color: colors.textMuted },
  hero: { flexDirection: 'row', gap: spacing.md },
  heroImg: { width: 88, height: 88, borderRadius: radii.lg, backgroundColor: colors.surface },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  heroMeta: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  heroTotal: { fontSize: 20, fontWeight: '900', color: colors.gold },
  sellerLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  sellerLinkText: { fontSize: 13, fontWeight: '700', color: colors.gold },
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.2)',
  },
  bannerText: { flex: 1, gap: 4 },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  bannerSub: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  section: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  timeline: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.border,
  },
  dotDone: { backgroundColor: colors.gold, borderColor: colors.gold },
  dotCurrent: { width: 12, height: 12, borderRadius: 6 },
  stepLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  stepLabelDone: { color: colors.textPrimary, fontWeight: '700' },
  tracking: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  eta: { fontSize: 12, color: colors.textMuted },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  reportRow: { paddingHorizontal: spacing.xs },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionHighlight: { backgroundColor: colors.gold, borderColor: colors.gold },
  actionDisabled: { opacity: 0.45 },
  actionLabel: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  actionLabelHighlight: { color: '#0a0a0a' },
  pressed: { opacity: 0.9 },
  reviewedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  reviewedText: { flex: 1, fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  receipt: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 6,
  },
  receiptTitle: { fontSize: 13, fontWeight: '900', color: colors.textPrimary },
  receiptLine: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
});
