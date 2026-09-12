import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  isSellerPayoutSetupComplete,
  sellerConnectBadge,
  sellerConnectDetailMessage,
  type SellerConnectStatusResponse,
} from '../../../api/stripeConnectRepository';
import { isSellerPayoutSetupSubmitted } from '../../../lib/sellerHubEntry';
import { colors, radii, spacing } from '../../../theme';
import { SellerShipFromSetupCard } from './SellerShipFromSetupCard';
import { hq } from './hqStyles';

export function SellerHQSetupEssentials({
  accessToken,
  connectStatus,
  connectLoading,
  connectError,
  stripeSetupBusy,
  onStripeSetup,
  onShipFromSaved,
  forceShipFromEditKey,
}: {
  accessToken?: string;
  connectStatus: SellerConnectStatusResponse | null;
  connectLoading: boolean;
  connectError: string | null;
  stripeSetupBusy: boolean;
  onStripeSetup: () => void;
  onShipFromSaved?: () => void;
  forceShipFromEditKey?: number;
}) {
  const payoutComplete = isSellerPayoutSetupComplete(connectStatus);
  const payoutSubmitted = isSellerPayoutSetupSubmitted(connectStatus);
  const payoutDoneForUi = payoutComplete || payoutSubmitted;
  const badge = sellerConnectBadge(connectStatus, { fetchError: connectError });

  const [shipFromComplete, setShipFromComplete] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(false);
  const allComplete = payoutDoneForUi && shipFromComplete;
  const showCollapsed = allComplete && !forceExpanded;

  useEffect(() => {
    if (forceShipFromEditKey && forceShipFromEditKey > 0) setForceExpanded(true);
  }, [forceShipFromEditKey]);

  return (
    <View style={styles.wrap}>
      <Text style={hq.sectionEyebrow}>Seller essentials</Text>
      <Text style={styles.sectionTitle}>Payouts & ship-from</Text>

      <View style={[styles.panel, hq.goldCard, showCollapsed && styles.panelCollapsed]}>
        {showCollapsed ? (
          <Pressable
            style={({ pressed }) => [styles.collapseRow, pressed && styles.pressed]}
            onPress={() => setForceExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel="Payouts and shipping — both set up. Tap to review."
          >
            <View style={styles.collapseIcon}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.collapseTitle}>Payouts & shipping</Text>
              <Text style={styles.collapseSub}>Stripe connected · ship-from saved</Text>
            </View>
            <Ionicons name="chevron-down-outline" size={16} color={colors.textMuted} />
          </Pressable>
        ) : (
          <>
            {allComplete ? (
              <Pressable
                style={({ pressed }) => [styles.collapseRow, styles.collapseRowExpanded, pressed && styles.pressed]}
                onPress={() => setForceExpanded(false)}
                accessibilityRole="button"
                accessibilityLabel="Collapse payouts and shipping"
              >
                <Text style={styles.collapseSub}>Tap to collapse</Text>
                <Ionicons name="chevron-up-outline" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}

            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="wallet-outline" size={20} color={colors.gold} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle}>Payout account</Text>
                {connectLoading && !connectStatus ? (
                  <ActivityIndicator color={colors.gold} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
                ) : (
                  <>
                    <Text style={styles.rowValue}>{badge}</Text>
                    {payoutComplete ? (
                      <Text style={styles.rowSub}>Stripe Connect is ready for marketplace and live sales.</Text>
                    ) : payoutSubmitted ? (
                      <Text style={styles.rowSub}>
                        Stripe received your details. Publishing and live unlock when verification finishes.
                      </Text>
                    ) : (
                      <Text style={styles.rowSub} numberOfLines={2}>
                        {sellerConnectDetailMessage(connectStatus, { fetchError: connectError })}
                      </Text>
                    )}
                  </>
                )}
              </View>
              {!payoutDoneForUi ? (
                <Pressable
                  style={[styles.rowBtn, stripeSetupBusy && styles.rowBtnOff]}
                  onPress={onStripeSetup}
                  disabled={stripeSetupBusy}
                >
                  {stripeSetupBusy ? (
                    <ActivityIndicator color="#0a0a0a" size="small" />
                  ) : (
                    <Text style={styles.rowBtnTxt}>Connect</Text>
                  )}
                </Pressable>
              ) : (
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              )}
            </View>

            <View style={styles.divider} />

            <SellerShipFromSetupCard
              accessToken={accessToken}
              embedded
              forceEditKey={forceShipFromEditKey}
              onSaved={onShipFromSaved}
              onCompletionChange={setShipFromComplete}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  sectionTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  panel: { padding: spacing.md, gap: spacing.md },
  panelCollapsed: { padding: 0 },
  collapseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  collapseRowExpanded: {
    justifyContent: 'flex-end',
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: -spacing.xs,
  },
  pressed: { opacity: 0.88 },
  collapseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(52,199,89,0.14)',
  },
  collapseTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  collapseSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  rowTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  rowValue: { fontSize: 15, fontWeight: '800', color: colors.gold, marginTop: 2 },
  rowSub: { fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 4 },
  rowBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  rowBtnOff: { opacity: 0.6 },
  rowBtnTxt: { fontSize: 12, fontWeight: '800', color: '#0a0a0a' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
