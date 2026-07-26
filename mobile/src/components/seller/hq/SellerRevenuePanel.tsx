import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SellerAnalyticsSnapshot } from '../../../api/sellerAnalyticsRepository';
import type {
  SellerWalletActivityRow,
  SellerWalletPayoutRow,
  SellerWalletSummary,
} from '../../../api/stripeConnectRepository';
import { walletSnapshot } from '../../../data/sellerHubMock';
import type { SellerReloadOptions } from '../../../hooks/sellerReloadOptions';
import { openStripeConnectDashboard } from '../../../lib/openStripeConnectDashboard';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';
import { SellerPayoutPreferenceCard } from './SellerPayoutPreferenceCard';
import { SellerPayoutTierCard } from './SellerPayoutTierCard';
import {
  StudioPrimaryButton,
  StudioSecondaryButton,
  StudioSection,
} from './SellerStudioUI';

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type SellerWalletState = {
  wallet: SellerWalletSummary | null;
  loading: boolean;
  loadedOnce: boolean;
  refreshing: boolean;
  refresh: (opts?: SellerReloadOptions) => Promise<SellerWalletSummary | null>;
};

function BalanceMetric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.balanceMetric}>
      <Text style={styles.balanceMetricLbl}>{label}</Text>
      <Text style={[styles.balanceMetricVal, accent && styles.balanceMetricValAccent]} numberOfLines={2}>
        {value}
      </Text>
      {hint ? <Text style={styles.balanceMetricHint}>{hint}</Text> : null}
    </View>
  );
}

function PayoutStep({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

export function SellerRevenuePanel({
  accessToken,
  sellerWallet,
  hasStripeAccount,
  onSetupPayouts,
  analytics,
}: {
  accessToken?: string;
  sellerWallet: SellerWalletState;
  hasStripeAccount: boolean;
  onSetupPayouts: () => void;
  analytics?: Pick<SellerAnalyticsSnapshot, 'completedSales' | 'completedTrades'>;
}) {
  const [stripeLinkBusy, setStripeLinkBusy] = useState(false);
  const [walletRefreshBusy, setWalletRefreshBusy] = useState(false);
  const w = sellerWallet.wallet;

  const showWalletPlaceholder = sellerWallet.loading && !sellerWallet.loadedOnce;
  const available = showWalletPlaceholder ? '…' : (w?.availableFormatted ?? walletSnapshot.available);
  const pending = showWalletPlaceholder ? '…' : (w?.pendingFormatted ?? walletSnapshot.pending);
  const nextPayout =
    showWalletPlaceholder ? '…' : (w?.nextPayoutLabel ?? (hasStripeAccount ? '—' : 'Connect Stripe'));
  const scheduleLine = w?.payoutScheduleSummary ?? w?.message ?? null;
  const completedSales = analytics?.completedSales ?? 0;
  const completedTrades = analytics?.completedTrades ?? 0;
  const recentPayouts: SellerWalletPayoutRow[] = w?.recentPayouts ?? [];
  const recentActivity: SellerWalletActivityRow[] = w?.recentActivity ?? [];

  const onRefresh = async () => {
    if (walletRefreshBusy) return;
    setWalletRefreshBusy(true);
    try {
      await sellerWallet.refresh({ silent: true });
    } finally {
      setWalletRefreshBusy(false);
    }
  };

  const openStripeSettings = async () => {
    if (!accessToken) return;
    if (!hasStripeAccount) {
      Alert.alert('Payout setup required', 'Connect Stripe before managing payouts.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Set up payouts', onPress: () => void onSetupPayouts() },
      ]);
      return;
    }
    setStripeLinkBusy(true);
    try {
      await openStripeConnectDashboard(accessToken);
    } catch (e) {
      Alert.alert('Could not open Stripe', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setStripeLinkBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <SellerPayoutPreferenceCard accessToken={accessToken} />

      <Text style={styles.intro}>
        Track available balance, pending funds, and payout timing. Stripe Connect balances appear below when that rail
        is selected; PayPal payouts send after your release gates.
      </Text>

      <View style={[styles.hero, hq.goldCard]}>
        <LinearGradient
          colors={['rgba(212,175,55,0.18)', 'rgba(12,12,14,0.98)', 'rgba(5,5,5,1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroTop}>
          <View style={styles.heroEyebrowRow}>
            <Ionicons name="wallet-outline" size={14} color={colors.gold} />
            <Text style={styles.heroEyebrow}>Available balance</Text>
          </View>
          <Pressable onPress={() => void onRefresh()} disabled={walletRefreshBusy} hitSlop={8} style={styles.refreshBtn}>
            {walletRefreshBusy ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={14} color={colors.gold} />
                <Text style={styles.refreshTxt}>Refresh</Text>
              </>
            )}
          </Pressable>
        </View>

        <Text style={styles.heroAmount}>{available}</Text>
        <Text style={styles.heroHint}>Transfers automatically on Stripe’s payout schedule — not instant withdraw.</Text>

        <View style={[styles.statusPill, hasStripeAccount ? styles.statusPillOk : styles.statusPillWarn]}>
          <Ionicons
            name={hasStripeAccount ? 'checkmark-circle' : 'alert-circle-outline'}
            size={12}
            color={hasStripeAccount ? colors.success : '#FFB340'}
          />
          <Text style={[styles.statusPillTxt, hasStripeAccount ? styles.statusPillTxtOk : styles.statusPillTxtWarn]}>
            {hasStripeAccount ? 'Payouts connected' : 'Setup required'}
          </Text>
        </View>

        <View style={styles.balanceGrid}>
          <BalanceMetric label="Pending" value={pending} hint="Clearing to available" />
          <BalanceMetric label="Next payout" value={nextPayout} />
          <BalanceMetric label="Completed sales" value={String(completedSales)} accent />
          {completedTrades > 0 ? (
            <BalanceMetric label="Completed trades" value={String(completedTrades)} />
          ) : null}
        </View>

        {scheduleLine ? <Text style={styles.scheduleLine}>{scheduleLine}</Text> : null}
      </View>

      {!hasStripeAccount ? (
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>Connect payouts to get paid</Text>
          <Text style={styles.setupBody}>
            Link your bank through Stripe Express. Once connected, sales flow here and pay out on your schedule.
          </Text>
          <StudioPrimaryButton label="Set up Stripe payouts" icon="card-outline" onPress={onSetupPayouts} />
        </View>
      ) : (
        <View style={styles.actionRow}>
          <StudioPrimaryButton
            label={stripeLinkBusy ? 'Opening Stripe…' : 'Bank & payout settings'}
            icon="open-outline"
            onPress={() => void openStripeSettings()}
            disabled={stripeLinkBusy}
          />
          <StudioSecondaryButton label="Refresh balance" icon="refresh-outline" onPress={() => void onRefresh()} disabled={walletRefreshBusy} />
        </View>
      )}

      {hasStripeAccount && recentPayouts.length > 0 ? (
        <StudioSection title="Recent payouts" subtitle="Money sent (or scheduled) to your bank">
          <View style={styles.listCard}>
            {recentPayouts.map((p, idx) => (
              <View
                key={p.id}
                style={[styles.listRow, idx < recentPayouts.length - 1 && styles.listRowBorder]}
              >
                <View style={styles.listMain}>
                  <Text style={styles.listTitle}>{p.amountFormatted}</Text>
                  <Text style={styles.listBody} numberOfLines={2}>
                    {p.destinationLabel}
                  </Text>
                  {p.arrivalDate ? (
                    <Text style={styles.listMeta}>Arrives {formatShortDate(p.arrivalDate)}</Text>
                  ) : null}
                </View>
                <View style={styles.listBadge}>
                  <Text style={styles.listBadgeTxt}>{p.statusLabel}</Text>
                </View>
              </View>
            ))}
          </View>
        </StudioSection>
      ) : null}

      {hasStripeAccount && recentActivity.length > 0 ? (
        <StudioSection
          title="Where your balance went"
          subtitle="Payouts, refunds, and label costs that changed your Stripe balance"
        >
          <View style={styles.listCard}>
            {recentActivity.map((row, idx) => {
              const outbound = row.amountCents < 0;
              return (
                <View
                  key={row.id}
                  style={[styles.listRow, idx < recentActivity.length - 1 && styles.listRowBorder]}
                >
                  <View style={styles.listMain}>
                    <Text style={styles.listTitle}>{row.title}</Text>
                    <Text style={styles.listBody} numberOfLines={3}>
                      {row.description}
                    </Text>
                    <Text style={styles.listMeta}>{formatShortDate(row.createdAt)}</Text>
                  </View>
                  <Text style={[styles.listAmount, outbound ? styles.listAmountOut : styles.listAmountIn]}>
                    {row.amountFormatted}
                  </Text>
                </View>
              );
            })}
          </View>
        </StudioSection>
      ) : null}

      <StudioSection title="How payouts work" subtitle="What happens after a buyer checks out">
        <PayoutStep
          icon="cart-outline"
          title="Sale completes"
          body="Marketplace orders and live wins settle through Vaulted checkout."
        />
        <PayoutStep
          icon="time-outline"
          title="Pending → available"
          body="Funds may sit in pending while Stripe clears the payment."
        />
        <PayoutStep
          icon="arrow-down-circle-outline"
          title="Automatic transfer"
          body="Available balance moves to your bank on Stripe’s payout schedule."
        />
      </StudioSection>

      <SellerPayoutTierCard accessToken={accessToken} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  hero: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  refreshTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  heroAmount: {
    color: colors.textPrimary,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
    marginTop: spacing.xs,
  },
  heroHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  statusPillOk: {
    borderColor: 'rgba(52,199,89,0.35)',
    backgroundColor: 'rgba(52,199,89,0.1)',
  },
  statusPillWarn: {
    borderColor: 'rgba(255,149,0,0.35)',
    backgroundColor: 'rgba(255,149,0,0.1)',
  },
  statusPillTxt: { fontSize: 11, fontWeight: '800' },
  statusPillTxtOk: { color: colors.success },
  statusPillTxtWarn: { color: '#FFB340' },
  balanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  balanceMetric: {
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 130,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  balanceMetricLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceMetricVal: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  balanceMetricValAccent: { color: colors.gold },
  balanceMetricHint: { marginTop: 4, fontSize: 10, color: colors.textMuted, lineHeight: 14 },
  scheduleLine: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  setupCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.3)',
    backgroundColor: 'rgba(255,149,0,0.06)',
    gap: spacing.sm,
  },
  setupTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  setupBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  actionRow: { gap: spacing.sm },
  listCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  listRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  listMain: { flex: 1, minWidth: 0, gap: 3 },
  listTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  listBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  listMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  listBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  listBadgeTxt: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  listAmount: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  listAmountOut: { color: '#F5A89A' },
  listAmountIn: { color: colors.success },
  stepRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  stepTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  stepBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
