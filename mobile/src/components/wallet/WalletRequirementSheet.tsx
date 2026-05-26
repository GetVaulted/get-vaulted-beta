import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { fetchBuyerWalletReadiness } from '../../api/buyerWalletRepository';
import type { BuyerWalletReadiness } from '../../lib/buyerWalletErrors';
import {
  openWebCommerceUrl,
  webAccountPaymentMethodsUrl,
  webAccountWalletShippingUrl,
} from '../../lib/openWebCommerce';
import { colors, radii, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';

type Props = {
  visible: boolean;
  onClose: () => void;
  accessToken?: string;
  roomId: string;
  /** Seed from snapshot / 402 without extra fetch. */
  initialReadiness?: BuyerWalletReadiness | null;
  onReadinessChange?: (readiness: BuyerWalletReadiness) => void;
};

export function WalletRequirementSheet({
  visible,
  onClose,
  accessToken,
  roomId,
  initialReadiness,
  onReadinessChange,
}: Props) {
  const [readiness, setReadiness] = useState<BuyerWalletReadiness | null>(initialReadiness ?? null);
  const [loading, setLoading] = useState(false);
  const [readyBanner, setReadyBanner] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'payment' | 'shipping' | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return null;
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
      setLoading(false);
    }
  }, [accessToken, onReadinessChange, roomId]);

  useEffect(() => {
    if (!visible) return;
    setReadyBanner(null);
    if (initialReadiness) setReadiness(initialReadiness);
    void refresh();
  }, [visible, initialReadiness, refresh]);

  useEffect(() => {
    if (!visible) return undefined;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [visible, refresh]);

  useEffect(() => {
    if (!visible || !readiness?.paymentReady || !readiness?.shippingReady) return;
    const t = setTimeout(() => {
      onClose();
    }, 1400);
    return () => clearTimeout(t);
  }, [visible, readiness?.paymentReady, readiness?.shippingReady, onClose]);

  const openPayment = async () => {
    const url = webAccountPaymentMethodsUrl();
    if (!url) return;
    setBusyAction('payment');
    try {
      await openWebCommerceUrl(url);
    } finally {
      setBusyAction(null);
    }
  };

  const openShipping = async () => {
    const url = webAccountWalletShippingUrl();
    if (!url) return;
    setBusyAction('shipping');
    try {
      await openWebCommerceUrl(url);
    } finally {
      setBusyAction(null);
    }
  };

  const paymentDone = readiness?.paymentReady === true;
  const shippingDone = readiness?.shippingReady === true;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
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
            {!paymentDone ? (
              <Pressable style={styles.actionBtn} onPress={() => void openPayment()} disabled={busyAction != null}>
                {busyAction === 'payment' ? (
                  <ActivityIndicator color="#0a0a0a" size="small" />
                ) : (
                  <LiveRoomText style={styles.actionBtnText}>Add</LiveRoomText>
                )}
              </Pressable>
            ) : null}
          </View>

          <View style={styles.row}>
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
            {!shippingDone ? (
              <Pressable style={styles.actionBtn} onPress={() => void openShipping()} disabled={busyAction != null}>
                {busyAction === 'shipping' ? (
                  <ActivityIndicator color="#0a0a0a" size="small" />
                ) : (
                  <LiveRoomText style={styles.actionBtnText}>Add</LiveRoomText>
                )}
              </Pressable>
            ) : null}
          </View>

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
    paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    gap: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.xs,
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
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rowSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 },
  actionBtn: {
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: '#0a0a0a', fontSize: 12, fontWeight: '900' },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  dismissBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dismissText: { color: colors.gold, fontSize: 14, fontWeight: '800' },
});
