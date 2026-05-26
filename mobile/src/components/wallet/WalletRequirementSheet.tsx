import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchBuyerWalletReadiness } from '../../api/buyerWalletRepository';
import type { BuyerWalletReadiness } from '../../lib/buyerWalletErrors';
import { colors, radii, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';
import { AddPaymentMethodForm } from './AddPaymentMethodForm';
import { AddShippingAddressForm } from './AddShippingAddressForm';

type WalletStep = 'requirements' | 'payment' | 'shipping';

type Props = {
  visible: boolean;
  onClose: () => void;
  accessToken?: string;
  roomId: string;
  /** Seed from snapshot / 402 without extra fetch. */
  initialReadiness?: BuyerWalletReadiness | null;
  onReadinessChange?: (readiness: BuyerWalletReadiness) => void;
  /** Fired when sheet opens/closes so live commerce can disable gestures. */
  onActiveChange?: (active: boolean) => void;
};

export function WalletRequirementSheet({
  visible,
  onClose,
  accessToken,
  roomId,
  initialReadiness,
  onReadinessChange,
  onActiveChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [readiness, setReadiness] = useState<BuyerWalletReadiness | null>(initialReadiness ?? null);
  const [loading, setLoading] = useState(false);
  const [readyBanner, setReadyBanner] = useState<string | null>(null);
  const [step, setStep] = useState<WalletStep>('requirements');
  const refreshInFlight = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken || refreshInFlight.current) return null;
    refreshInFlight.current = true;
    setLoading(true);
    try {
      const next = await fetchBuyerWalletReadiness(accessToken, roomId);
      if (next) {
        setReadiness(next);
        onReadinessChange?.(next);
        if (next.paymentReady && next.shippingReady) {
          setReadyBanner('Wallet ready. You can bid now.');
        }
      }
      return next;
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [accessToken, onReadinessChange, roomId]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    onActiveChange?.(visible);
    return () => onActiveChange?.(false);
  }, [visible, onActiveChange]);

  useEffect(() => {
    if (!visible) {
      setStep('requirements');
      setReadyBanner(null);
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      return;
    }
    if (initialReadiness) setReadiness(initialReadiness);
    void refreshRef.current();
  }, [visible, initialReadiness]);

  useEffect(() => {
    if (!visible || !readiness?.paymentReady || !readiness?.shippingReady || step !== 'requirements') {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      return;
    }
    dismissTimer.current = setTimeout(() => {
      onClose();
    }, 1400);
    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [visible, readiness?.paymentReady, readiness?.shippingReady, step, onClose]);

  const handleSubFlowSaved = () => {
    setStep('requirements');
    void refresh();
  };

  const paymentDone = readiness?.paymentReady === true;
  const shippingDone = readiness?.shippingReady === true;
  const sheetMaxHeight = Math.min(windowHeight * 0.88, 640);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={step === 'requirements' ? onClose : undefined} />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: sheetMaxHeight,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <View style={styles.handle} />

          {step === 'payment' ? (
            <AddPaymentMethodForm
              accessToken={accessToken}
              onBack={() => setStep('requirements')}
              onSaved={handleSubFlowSaved}
            />
          ) : step === 'shipping' ? (
            <AddShippingAddressForm
              accessToken={accessToken}
              onBack={() => setStep('requirements')}
              onSaved={handleSubFlowSaved}
            />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
              <LiveRoomText style={styles.title}>Wallet setup</LiveRoomText>
              <LiveRoomText style={styles.body}>
                Before you can bid, buy, or claim spots, add a payment method and shipping address.
              </LiveRoomText>

              {readyBanner ? (
                <View style={styles.readyBanner}>
                  <Ionicons name="checkmark-circle" size={18} color="#6ee7b7" />
                  <LiveRoomText style={styles.readyBannerText}>{readyBanner}</LiveRoomText>
                </View>
              ) : null}

              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Ionicons
                    name={paymentDone ? 'checkmark-circle' : 'card-outline'}
                    size={22}
                    color={paymentDone ? '#6ee7b7' : colors.gold}
                  />
                  <View style={styles.rowText}>
                    <LiveRoomText style={styles.rowTitle}>Payment method</LiveRoomText>
                    <LiveRoomText style={styles.rowSub}>
                      {paymentDone ? 'Added' : 'Required for live bids and checkout'}
                    </LiveRoomText>
                  </View>
                </View>
              </View>
              {!paymentDone ? (
                <Pressable style={styles.primaryBtn} onPress={() => setStep('payment')}>
                  <LiveRoomText style={styles.primaryBtnText}>Add Payment Method</LiveRoomText>
                </Pressable>
              ) : null}

              <View style={[styles.row, styles.rowSpaced]}>
                <View style={styles.rowLeft}>
                  <Ionicons
                    name={shippingDone ? 'checkmark-circle' : 'location-outline'}
                    size={22}
                    color={shippingDone ? '#6ee7b7' : colors.gold}
                  />
                  <View style={styles.rowText}>
                    <LiveRoomText style={styles.rowTitle}>Shipping address</LiveRoomText>
                    <LiveRoomText style={styles.rowSub}>
                      {shippingDone ? 'Added' : 'Required for live wins and fulfillment'}
                    </LiveRoomText>
                  </View>
                </View>
              </View>
              {!shippingDone ? (
                <Pressable style={styles.primaryBtn} onPress={() => setStep('shipping')}>
                  <LiveRoomText style={styles.primaryBtnText}>Add Shipping Address</LiveRoomText>
                </Pressable>
              ) : null}

              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.gold} size="small" />
                  <LiveRoomText style={styles.loadingText}>Checking wallet…</LiveRoomText>
                </View>
              ) : null}

              <Pressable style={styles.dismissBtn} onPress={onClose}>
                <LiveRoomText style={styles.dismissText}>
                  {paymentDone && shippingDone ? 'Continue in live room' : 'Stay in live room'}
                </LiveRoomText>
              </Pressable>
            </ScrollView>
          )}
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
    backgroundColor: '#121016',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.72)',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.35)',
    marginBottom: spacing.md,
  },
  readyBannerText: {
    flex: 1,
    color: '#d1fae5',
    fontSize: 13,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowSpaced: { marginTop: spacing.md },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rowSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 },
  primaryBtn: {
    marginTop: spacing.sm,
    minHeight: 46,
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryBtnText: { color: '#0a0a0a', fontSize: 13, fontWeight: '900' },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  dismissBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dismissText: { color: colors.gold, fontSize: 14, fontWeight: '800' },
});
