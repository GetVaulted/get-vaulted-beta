import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchSellerLayawayDetail, type SellerLayawayDetail } from '../../api/layawayRepository';
import { PremiumVaultButton } from '../../components/product/PremiumVaultButton';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useAuth } from '../../auth/AuthContext';
import { useVaultEcosystemEvents } from '../../hooks/useVaultEcosystemEvents';
import {
  sellerLayawayPaymentKindLabel,
  sellerLayawayStatusLabel,
} from '../../lib/sellerLayawayDisplay';
import { openSellerHQ } from '../../navigation/openSellerHQ';
import { openUserProfile } from '../../navigation/openPlatform';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SellerLayawayDetail'>;

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
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

export function SellerLayawayDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session, user } = useAuth();
  const [detail, setDetail] = useState<SellerLayawayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.access_token) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const row = await fetchSellerLayawayDetail(session.access_token, route.params.layawayId);
    if (!row) setError('Layaway not found.');
    setDetail(row);
    setLoading(false);
  }, [route.params.layawayId, session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onLayawayEvent = useCallback(() => {
    void load();
  }, [load]);

  useVaultEcosystemEvents(user?.id, {
    enabled: Boolean(session?.access_token && user?.id),
    entityId: route.params.layawayId,
    onLayaway: onLayawayEvent,
  });

  const canShip = detail?.status === 'completed';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Layaway detail" subtitle="Seller view" onBack={() => navigation.goBack()} />

      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : error || !detail ? (
        <Text style={styles.empty}>{error ?? 'Layaway not found.'}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {!canShip ? (
            <View style={styles.warnCard}>
              <Ionicons name="warning-outline" size={20} color="#FF8A80" />
              <Text style={styles.warnTxt}>
                Do not ship until paid in full. This listing is reserved on layaway.
              </Text>
            </View>
          ) : (
            <View style={styles.readyCard}>
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.gold} />
              <Text style={styles.readyTxt}>
                Paid in full — ready to ship. Fulfill this order from Seller HQ → Fulfillment.
              </Text>
            </View>
          )}

          <View style={styles.itemCard}>
            {detail.listingImageUrl ? (
              <Image source={{ uri: detail.listingImageUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{detail.listingTitle}</Text>
              <Text style={styles.itemPrice}>{formatMoney(detail.originalPriceUsd)}</Text>
              <Text style={styles.itemMeta}>
                Listing {detail.listingStatus.replace(/_/g, ' ')} · {detail.planType.replace(/_/g, ' ')} plan
              </Text>
            </View>
          </View>

          <Section title="Buyer">
            <Pressable onPress={() => openUserProfile(detail.buyerId, navigation)}>
              <Text style={styles.link}>@{detail.buyerUsername}</Text>
            </Pressable>
          </Section>

          <Section title="Status">
            <Text style={styles.status}>{sellerLayawayStatusLabel(detail.displayStatus)}</Text>
            <Text style={styles.line}>Due {formatDate(detail.dueAt)}</Text>
            <Text style={styles.line}>Started {formatDate(detail.startedAt)}</Text>
            <Text style={styles.line}>Created {formatDate(detail.createdAt)}</Text>
          </Section>

          <Section title="Balances">
            <Text style={styles.line}>Deposit {formatMoney(detail.depositAmountUsd)}</Text>
            <Text style={styles.line}>Amount paid {formatMoney(detail.amountPaidUsd)}</Text>
            <Text style={styles.lineStrong}>Remaining {formatMoney(detail.remainingBalanceUsd)}</Text>
            <Text style={styles.line}>Shipping {formatMoney(detail.shippingPriceUsd)}</Text>
          </Section>

          <Section title="Payment history">
            {detail.payments.length === 0 ? (
              <Text style={styles.line}>No payments recorded yet.</Text>
            ) : (
              detail.payments.map((p) => (
                <View key={p.id} style={styles.payRow}>
                  <View>
                    <Text style={styles.payKind}>{sellerLayawayPaymentKindLabel(p.kind)}</Text>
                    <Text style={styles.payDate}>{formatDate(p.paidAt)}</Text>
                  </View>
                  <Text style={styles.payAmt}>{formatMoney(p.amountUsd)}</Text>
                </View>
              ))
            )}
          </Section>

          {canShip ? (
            <PremiumVaultButton
              label="Open fulfillment"
              icon="cube-outline"
              variant="primary"
              onPress={() => {
                navigation.goBack();
                openSellerHQ(undefined, { tab: 'orders' });
              }}
            />
          ) : null}
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
  warnCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,138,128,0.4)',
    backgroundColor: 'rgba(255,138,128,0.08)',
    alignItems: 'flex-start',
  },
  warnTxt: { flex: 1, color: '#FF8A80', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  readyCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    alignItems: 'flex-start',
  },
  readyTxt: { flex: 1, color: colors.gold, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  itemCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumb: { width: 88, height: 88, borderRadius: radii.md },
  thumbEmpty: { backgroundColor: colors.surfaceElevated },
  itemTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  itemPrice: { fontSize: 18, fontWeight: '900', color: colors.gold, marginTop: 4 },
  itemMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  section: { gap: spacing.xs },
  sectionKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  status: { fontSize: 16, fontWeight: '900', color: colors.gold },
  line: { fontSize: 14, color: colors.textSecondary },
  lineStrong: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  link: { fontSize: 15, fontWeight: '700', color: colors.gold },
  payRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  payKind: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  payDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  payAmt: { fontSize: 15, fontWeight: '800', color: colors.gold },
});
