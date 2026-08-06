import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { LiveBuyerPaymentFailureSnapshot } from '../../api/liveRoomBuyerRepository';
import { retryLivePaymentFailure } from '../../api/livePaymentFailureRepository';
import { useLiveConfirmPayment } from './LiveStripeProvider';
import {
  isShippingAddressRecoveryFailure,
  mapLivePaymentFailureMessage,
  recoveryStatusMessage,
  PAYMENT_RECOVERY_SUBTITLE,
} from '../../lib/livePaymentFailureCopy';
import {
  shouldOpenWalletPaymentSetupOnRecovery,
  walletRecoveryPaymentSetupStartWith,
} from '../../lib/androidPaymentSheetPresentation';
import { colors, spacing } from '../../theme';
import { withLivePlaybackCommerceHold } from '../../lib/livePlaybackCommerceHold';
import { LiveRoomText } from './LiveRoomText';
import { WalletSheet } from '../wallet/WalletSheet';

type Props = {
  visible: boolean;
  roomId: string;
  accessToken?: string;
  failure: LiveBuyerPaymentFailureSnapshot;
  onResolved: () => void;
  onLeaveRoom: () => void;
  onWalletOverlayChange?: (active: boolean) => void;
  onBlockerActiveChange?: (active: boolean) => void;
};

function formatAmount(amountUsd: number): string {
  return `$${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LivePaymentFailureModal({
  visible,
  roomId,
  accessToken,
  failure,
  onResolved,
  onLeaveRoom,
  onWalletOverlayChange,
  onBlockerActiveChange,
}: Props) {
  const confirmPayment = useLiveConfirmPayment();
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  // Once a new card is saved + retried, the original failure reason ("Your card has expired") is
  // stale — suppress it and show the real finalize/retry outcome instead.
  const [cardSaved, setCardSaved] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0)).current;

  const reasonLine = cardSaved ? null : mapLivePaymentFailureMessage(failure.failureReason);
  const shippingRecovery = isShippingAddressRecoveryFailure(failure.failureReason);
  // Card declines jump into payment setup; shipping failures open the address step.
  // Android must NOT auto-start PaymentSheet (`card`) inside nested Modals — that stuck buyers.
  const walletInitialStep = shippingRecovery ? ('shipping' as const) : ('payment' as const);
  const openPaymentSetupOnMount = shouldOpenWalletPaymentSetupOnRecovery({ shippingRecovery });
  const paymentSetupStartWith = walletRecoveryPaymentSetupStartWith();

  useEffect(() => {
    onBlockerActiveChange?.(visible && !walletOpen);
    return () => onBlockerActiveChange?.(false);
  }, [visible, walletOpen, onBlockerActiveChange]);

  useEffect(() => {
    if (!visible) {
      setWalletOpen(false);
      setStatusLine(null);
      setBusy(false);
      setCardSaved(false);
      entrance.setValue(0);
    }
  }, [visible, entrance]);

  // A brand-new failure (different id) means fresh context — drop any prior recovery state.
  useEffect(() => {
    setCardSaved(false);
    setStatusLine(null);
  }, [failure.id]);

  useEffect(() => {
    if (!visible || walletOpen) return;
    Animated.timing(entrance, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, walletOpen, entrance]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (walletOpen) {
      console.log('[payment failure] wallet sheet visible');
    }
  }, [walletOpen]);

  const runRetry = useCallback(
    async (paymentMethodId?: string): Promise<boolean> => {
      if (!accessToken?.trim()) {
        console.log('[payment failure] retry payment fail (no access token)');
        return false;
      }
      console.log('[payment recovery] mobile retry starting', {
        failureId: failure.id,
        orderId: failure.orderId ?? null,
        paymentMethodId: paymentMethodId ?? null,
      });
      console.log('[payment failure] retry payment started');
      setBusy(true);
      setStatusLine(null);
      try {
        const result = await retryLivePaymentFailure({
          accessToken,
          roomId,
          failureId: failure.id,
          paymentMethodId,
        });
        if (result.ok && 'paid' in result && result.paid) {
          console.log('[payment failure] retry payment success');
          onResolved();
          return true;
        }
        if (result.ok && 'requiresAction' in result && result.requiresAction) {
          if (!confirmPayment) {
            setStatusLine('Payments are still starting up — try again in a moment.');
            return false;
          }
          const conf = await withLivePlaybackCommerceHold(() =>
            confirmPayment(result.clientSecret, { paymentMethodType: 'Card' }),
          );
          if (conf.error) {
            const msg = mapLivePaymentFailureMessage(conf.error.message, conf.error.code);
            setStatusLine(msg);
            console.log('[payment failure] retry payment fail', msg);
            return false;
          }
          const sync = await retryLivePaymentFailure({
            accessToken,
            roomId,
            failureId: failure.id,
            action: 'sync',
          });
          if (sync.ok && 'paid' in sync && sync.paid) {
            console.log('[payment failure] retry payment success');
            onResolved();
            return true;
          }
          if (!sync.ok) {
            const msg = recoveryStatusMessage(sync.status) ?? sync.error;
            setStatusLine(msg);
            console.log('[payment failure] retry payment fail', { status: sync.status ?? null, msg });
          }
          return false;
        }
        if (result.ok && 'processing' in result) {
          const msg = 'Payment is processing — try again in a moment.';
          setStatusLine(msg);
          console.log('[payment failure] retry payment fail', msg);
          return false;
        }
        if (!result.ok) {
          const msg = recoveryStatusMessage(result.status) ?? result.error;
          setStatusLine(msg);
          console.log('[payment failure] retry payment fail', { status: result.status ?? null, msg });
        }
        return false;
      } catch {
        const msg = 'Network error — try again.';
        setStatusLine(msg);
        console.log('[payment failure] retry payment fail', msg);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, confirmPayment, failure.id, failure.orderId, failure.variantPurchaseId, onResolved, roomId],
  );

  const openWalletForRecovery = () => {
    console.log('[payment failure] fix payment pressed');
    if (!accessToken?.trim()) {
      setStatusLine('Sign in to update your payment method.');
      console.log('[payment failure] opening wallet sheet blocked (no access token)');
      return;
    }
    console.log('[payment failure] opening wallet sheet');
    setWalletOpen(true);
    onWalletOverlayChange?.(true);
  };

  const closeWallet = () => {
    setWalletOpen(false);
    onWalletOverlayChange?.(false);
  };

  const handlePaymentMethodSaved = (paymentMethodId?: string) => {
    setCardSaved(true);
    void (async () => {
      const ok = await runRetry(paymentMethodId);
      if (ok) closeWallet();
    })();
  };

  const cardScale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const cardOpacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });

  if (!visible) return null;

  const showBlocker = !walletOpen;

  return (
    <>
      <Modal
        visible={showBlocker}
        animationType="none"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={onLeaveRoom}
      >
        <View style={styles.backdrop} accessibilityViewIsModal>
          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardOpacity,
                transform: [{ scale: cardScale }],
              },
            ]}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark" size={22} color={colors.gold} />
            </View>
            <LiveRoomText style={styles.title}>Secure payment recovery</LiveRoomText>
            <LiveRoomText style={styles.subtitle}>{PAYMENT_RECOVERY_SUBTITLE}</LiveRoomText>

            {failure.itemTitle ? (
              <LiveRoomText style={styles.itemName} numberOfLines={2}>
                {failure.itemTitle}
              </LiveRoomText>
            ) : null}
            <LiveRoomText style={styles.amount}>{formatAmount(failure.amountUsd)}</LiveRoomText>

            {reasonLine ? <LiveRoomText style={styles.reason}>{reasonLine}</LiveRoomText> : null}
            {statusLine ? <LiveRoomText style={styles.status}>{statusLine}</LiveRoomText> : null}

            <View style={styles.actions}>
              <Animated.View
                pointerEvents="none"
                style={[styles.primaryGlow, { opacity: glowOpacity }]}
              />
              <Pressable
                style={[styles.primaryBtn, busy && styles.disabled]}
                disabled={busy}
                onPress={openWalletForRecovery}
                accessibilityRole="button"
                accessibilityLabel="Update Wallet"
              >
                <LiveRoomText style={styles.primaryLabel}>Update Wallet</LiveRoomText>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, busy && styles.disabled]}
                disabled={busy}
                onPress={() => void runRetry()}
                accessibilityRole="button"
                accessibilityLabel="Retry payment"
              >
                {busy ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <LiveRoomText style={styles.secondaryLabel}>Retry payment</LiveRoomText>
                )}
              </Pressable>
              <Pressable
                style={[styles.tertiaryBtn, busy && styles.disabled]}
                disabled={busy}
                onPress={onLeaveRoom}
                accessibilityRole="button"
                accessibilityLabel="Leave room"
              >
                <LiveRoomText style={styles.tertiaryLabel}>Leave room</LiveRoomText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
      {accessToken ? (
        <WalletSheet
          visible={walletOpen}
          onClose={closeWallet}
          accessToken={accessToken}
          roomId={roomId}
          recoveryMode
          initialStep={walletInitialStep}
          openPaymentSetupOnMount={openPaymentSetupOnMount}
          paymentSetupStartWith={paymentSetupStartWith}
          onPaymentMethodSaved={handlePaymentMethodSaved}
          onActiveChange={(active) => {
            if (active) onWalletOverlayChange?.(true);
          }}
        />
      ) : null}
    </>
  );
}

const CARD_RADIUS = 24;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 80, 0.22)',
    backgroundColor: 'rgba(10, 10, 11, 0.94)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md + 4,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 80, 0.28)',
    backgroundColor: 'rgba(255, 215, 80, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  itemName: {
    marginTop: spacing.md,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  amount: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '800',
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  reason: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    color: '#fecdd3',
    textAlign: 'center',
  },
  status: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    color: '#fda4af',
    textAlign: 'center',
  },
  actions: {
    marginTop: spacing.lg,
    width: '100%',
    gap: spacing.sm,
    position: 'relative',
  },
  primaryGlow: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    bottom: undefined,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 215, 80, 0.22)',
  },
  primaryBtn: {
    borderRadius: 999,
    backgroundColor: colors.gold,
    paddingVertical: 13,
    alignItems: 'center',
    zIndex: 1,
  },
  primaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.background,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  secondaryBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tertiaryBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  tertiaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  disabled: {
    opacity: 0.55,
  },
});
