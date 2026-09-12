import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SellerAnalyticsSnapshot } from '../../../api/sellerAnalyticsRepository';
import {
  fetchSellerPayoutPreference,
  type SellerPayoutPreferenceDTO,
} from '../../../api/sellerPayoutPreferenceRepository';
import type {
  SellerWalletActivityRow,
  SellerWalletPayoutRow,
  SellerWalletSummary,
} from '../../../api/stripeConnectRepository';
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

/** Recent payouts / activity are capped on-screen; "See all" sends sellers to the real Stripe
 * history instead of a half-built in-app list — the backend only fetches ~10-15 rows anyway. */
const RECENT_ROWS_CAP = 5;

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

type SellerWalletState = {
  wallet: SellerWalletSummary | null;
  loading: boolean;
  loadedOnce: boolean;
  refreshing: boolean;
  refresh: (opts?: SellerReloadOptions) => Promise<SellerWalletSummary | null>;
};

function MetricCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metricCell}>
      <Text style={[styles.metricVal, accent && styles.metricValAccent]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricLbl}>{label}</Text>
    </View>
  );
}

function LedgerRow({
  title,
  meta,
  amount,
  amountTone,
  border,
}: {
  title: string;
  meta: string;
  amount: string;
  amountTone: 'in' | 'out' | 'neutral';
  border?: boolean;
}) {
  return (
    <View style={[styles.ledgerRow, border && styles.ledgerRowBorder]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.ledgerTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.ledgerMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text
        style={[
          styles.ledgerAmount,
          amountTone === 'in' && styles.ledgerAmountIn,
          amountTone === 'out' && styles.ledgerAmountOut,
        ]}
      >
        {amount}
      </Text>
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
  const [payoutPref, setPayoutPref] = useState<SellerPayoutPreferenceDTO | null>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const w = sellerWallet.wallet;

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetchSellerPayoutPreference(accessToken).then((pref) => {
      if (!cancelled) setPayoutPref(pref);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // While the preference is still loading (or the fetch failed) this defaults to the Stripe view,
  // matching the behavior every seller had before PayPal existed as an option.
  const isPaypalRail = payoutPref?.preferredSellerPayoutProcessor === 'PAYPAL';

  const showWalletPlaceholder = sellerWallet.loading && !sellerWallet.loadedOnce;
  const available = showWalletPlaceholder ? '…' : (w?.availableFormatted ?? '—');
  const pending = showWalletPlaceholder ? '…' : (w?.pendingFormatted ?? '—');
  const nextPayout = showWalletPlaceholder ? '…' : (w?.nextPayoutLabel ?? (hasStripeAccount ? '—' : 'Connect Stripe'));
  const completedSales = analytics?.completedSales ?? 0;
  const completedTrades = analytics?.completedTrades ?? 0;
  const allRecentPayouts = w?.recentPayouts ?? [];
  const allRecentActivity = w?.recentActivity ?? [];
  const recentPayouts: SellerWalletPayoutRow[] = allRecentPayouts.slice(0, RECENT_ROWS_CAP);
  const recentActivity: SellerWalletActivityRow[] = allRecentActivity.slice(0, RECENT_ROWS_CAP);
  // Derived from real fetched payout amounts — never invented.
  const avgPayoutUsd =
    allRecentPayouts.length > 0
      ? allRecentPayouts.reduce((sum, p) => sum + p.amountCents, 0) / allRecentPayouts.length / 100
      : null;

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

      {isPaypalRail ? (
        <View style={[styles.paypalCard, hq.goldCard]}>
          <View style={styles.paypalTop}>
            <Ionicons name="logo-paypal" size={16} color={colors.gold} />
            <Text style={styles.paypalEyebrow}>PayPal payouts</Text>
          </View>
          <Text style={styles.paypalBody}>
            Funds send directly to {payoutPref?.paypalPayoutEmail?.trim() || 'your PayPal email'} after each
            order clears its release gates — there&apos;s no running balance to show here since each payout
            goes out per order.
          </Text>
          {payoutPref?.paypalPayoutVerifiedAt ? (
            <View style={[styles.statusPill, styles.statusPillOk]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.success} />
              <Text style={[styles.statusPillTxt, styles.statusPillTxtOk]}>Email verified</Text>
            </View>
          ) : (
            <View style={[styles.statusPill, styles.statusPillWarn]}>
              <Ionicons name="alert-circle-outline" size={12} color="#FFB340" />
              <Text style={[styles.statusPillTxt, styles.statusPillTxtWarn]}>Verify your PayPal email above</Text>
            </View>
          )}
        </View>
      ) : (
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
              <Text style={styles.heroEyebrow}>Stripe Connect balance</Text>
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

          <View style={[styles.statusPill, hasStripeAccount ? styles.statusPillOk : styles.statusPillWarn]}>
            <Ionicons
              name={hasStripeAccount ? 'checkmark-circle' : 'alert-circle-outline'}
              size={12}
              color={hasStripeAccount ? colors.success : '#FFB340'}
            />
            <Text style={[styles.statusPillTxt, hasStripeAccount ? styles.statusPillTxtOk : styles.statusPillTxtWarn]}>
              {hasStripeAccount ? 'Connected' : 'Setup required'}
            </Text>
          </View>

          <View style={styles.balanceSplit}>
            <View style={styles.balanceSplitCell}>
              <Text style={styles.balanceSplitLbl}>Pending</Text>
              <Text style={styles.balanceSplitVal}>{pending}</Text>
            </View>
            <View style={[styles.balanceSplitCell, styles.balanceSplitCellBorder]}>
              <Text style={styles.balanceSplitLbl}>Est. next payout</Text>
              <Text style={styles.balanceSplitVal} numberOfLines={2}>
                {nextPayout}
              </Text>
              {w?.nextPayoutLabel && hasStripeAccount ? (
                <Text style={styles.balanceSplitHint}>From Stripe · can shift</Text>
              ) : null}
            </View>
          </View>
        </View>
      )}

      <View style={[styles.metricsRow, hq.goldCard]}>
        <MetricCell label="Sales" value={String(completedSales)} />
        <View style={styles.metricDivider} />
        <MetricCell label="Trades" value={String(completedTrades)} />
        {avgPayoutUsd != null ? (
          <>
            <View style={styles.metricDivider} />
            <MetricCell label="Avg payout" value={formatUsd(avgPayoutUsd)} accent />
          </>
        ) : null}
      </View>

      <SellerPayoutTierCard accessToken={accessToken} />

      {!isPaypalRail && hasStripeAccount && recentPayouts.length > 0 ? (
        <StudioSection title="Recent payouts" subtitle="Money sent (or scheduled) to your bank">
          <View style={styles.listCard}>
            {recentPayouts.map((p, idx) => (
              <LedgerRow
                key={p.id}
                title={p.destinationLabel}
                meta={
                  p.status === 'paid'
                    ? `Arrived ${formatShortDate(p.arrivalDate)}`
                    : `Est. arrival ${formatShortDate(p.arrivalDate) || 'pending'}`
                }
                amount={p.amountFormatted}
                amountTone="neutral"
                border={idx > 0}
              />
            ))}
          </View>
          {allRecentPayouts.length > RECENT_ROWS_CAP ? (
            <Pressable onPress={() => void openStripeSettings()} hitSlop={8} style={styles.seeAllBtn}>
              <Text style={styles.seeAllTxt}>See full history in Stripe</Text>
            </Pressable>
          ) : null}
        </StudioSection>
      ) : null}

      {!isPaypalRail && hasStripeAccount && recentActivity.length > 0 ? (
        <StudioSection
          title="Balance activity"
          subtitle="Payouts, refunds, and label costs that changed your Stripe balance"
        >
          <View style={styles.listCard}>
            {recentActivity.map((row, idx) => (
              <LedgerRow
                key={row.id}
                title={row.title}
                meta={formatShortDate(row.createdAt)}
                amount={row.amountFormatted}
                amountTone={row.amountCents < 0 ? 'out' : 'in'}
                border={idx > 0}
              />
            ))}
          </View>
          <Text style={styles.cappedNote}>
            Showing {recentActivity.length} most recent
            {allRecentActivity.length > RECENT_ROWS_CAP ? ' · full history in Stripe' : ''}
          </Text>
          {allRecentActivity.length > RECENT_ROWS_CAP ? (
            <Pressable onPress={() => void openStripeSettings()} hitSlop={8} style={styles.seeAllBtn}>
              <Text style={styles.seeAllTxt}>See full history in Stripe</Text>
            </Pressable>
          ) : null}
        </StudioSection>
      ) : null}

      <Pressable style={styles.howItWorksStrip} onPress={() => setHowItWorksOpen((v) => !v)} hitSlop={8}>
        <View style={styles.howItWorksLeft}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.howItWorksTxt}>How payouts work</Text>
        </View>
        <Ionicons
          name={howItWorksOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {howItWorksOpen ? (
        <View style={styles.howItWorksBody}>
          <PayoutStep
            icon="cart-outline"
            title="Sale completes"
            body="Marketplace orders and live wins settle through Vaulted checkout."
          />
          <PayoutStep
            icon="time-outline"
            title="Held → released"
            body="Your payout tier above controls when we release funds — see its release trigger there."
          />
          <PayoutStep
            icon="arrow-down-circle-outline"
            title="Sent to you"
            body={
              isPaypalRail
                ? 'Released funds send to your PayPal email.'
                : "Released funds move to your bank on Stripe's own payout schedule — timing shown here is an estimate, not a guarantee Get Vaulted controls."
            }
          />
        </View>
      ) : null}

      {!isPaypalRail ? (
        !hasStripeAccount ? (
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Connect payouts to get paid</Text>
            <Text style={styles.setupBody}>
              Link your bank through Stripe Express. Once connected, sales flow here and pay out on Stripe&apos;s
              schedule.
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
            <StudioSecondaryButton
              label="Refresh balance"
              icon="refresh-outline"
              onPress={() => void onRefresh()}
              disabled={walletRefreshBusy}
            />
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
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
  balanceSplit: {
    flexDirection: 'row',
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: spacing.sm,
  },
  balanceSplitCell: { flex: 1 },
  balanceSplitCellBorder: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.08)',
    paddingLeft: spacing.sm,
  },
  balanceSplitLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceSplitVal: { marginTop: 3, fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  balanceSplitHint: { marginTop: 1, fontSize: 9, color: colors.textMuted },
  paypalCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  paypalTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paypalEyebrow: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  paypalBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  metricsRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  metricCell: { flex: 1, alignItems: 'center', gap: 2 },
  metricDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  metricVal: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  metricValAccent: { color: colors.gold },
  metricLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  ledgerRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  ledgerTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', lineHeight: 17 },
  ledgerMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  ledgerAmount: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginTop: 1 },
  ledgerAmountIn: { color: colors.success },
  ledgerAmountOut: { color: '#F5A89A' },
  cappedNote: { marginTop: spacing.xs, textAlign: 'center', fontSize: 11, color: colors.textMuted },
  seeAllBtn: { alignSelf: 'center', marginTop: spacing.sm, paddingVertical: 4, paddingHorizontal: 8 },
  seeAllTxt: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  howItWorksStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  howItWorksLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  howItWorksTxt: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  howItWorksBody: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
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
