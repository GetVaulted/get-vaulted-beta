import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import type { LiveBuyerPaymentFailureSnapshot } from '../../api/liveRoomBuyerRepository';
import { retryLivePaymentFailure } from '../../api/livePaymentFailureRepository';
import { colors, radii, spacing } from '../../theme';
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
};

export function LivePaymentFailureModal({
  visible,
  roomId,
  accessToken,
  failure,
  onResolved,
  onLeaveRoom,
  onWalletOverlayChange,
}: Props) {
  const { confirmPayment } = useStripe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  const runRetry = useCallback(async () => {
    if (!accessToken?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await retryLivePaymentFailure({
        accessToken,
        roomId,
        failureId: failure.id,
      });
      if (result.ok && 'paid' in result && result.paid) {
        setSuccess(true);
        onResolved();
        return;
      }
      if (result.ok && 'requiresAction' in result && result.requiresAction) {
        const conf = await confirmPayment(result.clientSecret, { paymentMethodType: 'Card' });
        if (conf.error) {
          setError(conf.error.message ?? 'Verification failed.');
          return;
        }
        const sync = await retryLivePaymentFailure({
          accessToken,
          roomId,
          failureId: failure.id,
          action: 'sync',
        });
        if (sync.ok && 'paid' in sync && sync.paid) {
          setSuccess(true);
          onResolved();
          return;
        }
        if (!sync.ok) {
          setError(sync.error);
        }
        return;
      }
      if (result.ok && 'processing' in result) {
        setError('Payment is processing — try again in a moment.');
        return;
      }
      if (!result.ok) {
        setError(result.error);
      }
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }, [accessToken, confirmPayment, failure.id, onResolved, roomId]);

  const handleFixPayment = () => {
    setWalletOpen(true);
    onWalletOverlayChange?.(true);
    void runRetry();
  };

  return (
    <>
      <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => {}}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <LiveRoomText style={styles.kicker}>Payment required</LiveRoomText>
            <LiveRoomText style={styles.title}>
              {success
                ? "Payment successful. You're all set."
                : 'Payment failed for your winning bid. Please update your payment method to continue.'}
            </LiveRoomText>
            {failure.itemTitle ? (
              <LiveRoomText style={styles.meta}>
                {failure.itemTitle} · ${failure.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </LiveRoomText>
            ) : null}
            {failure.failureReason && !success ? (
              <LiveRoomText style={styles.reason}>{failure.failureReason}</LiveRoomText>
            ) : null}
            {error ? <LiveRoomText style={styles.error}>{error}</LiveRoomText> : null}
            {!success ? (
              <View style={styles.actions}>
                <Pressable
                  style={[styles.primaryBtn, busy && styles.disabled]}
                  disabled={busy}
                  onPress={handleFixPayment}
                  accessibilityRole="button"
                >
                  {busy ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <LiveRoomText style={styles.primaryLabel}>Fix payment</LiveRoomText>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, busy && styles.disabled]}
                  disabled={busy}
                  onPress={onLeaveRoom}
                  accessibilityRole="button"
                >
                  <LiveRoomText style={styles.secondaryLabel}>Leave room</LiveRoomText>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.primaryBtn} onPress={onResolved} accessibilityRole="button">
                <LiveRoomText style={styles.primaryLabel}>Continue</LiveRoomText>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
      {accessToken ? (
        <WalletSheet
          visible={walletOpen}
          onClose={() => {
            setWalletOpen(false);
            onWalletOverlayChange?.(false);
          }}
          accessToken={accessToken}
          roomId={roomId}
          onActiveChange={(active) => onWalletOverlayChange?.(active)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.35)',
    backgroundColor: '#0a0a0b',
    padding: spacing.lg,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#fda4af',
  },
  title: {
    marginTop: spacing.sm,
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 24,
  },
  meta: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textSecondary,
  },
  reason: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: '#fecdd3',
  },
  error: {
    marginTop: spacing.md,
    fontSize: 14,
    color: '#fda4af',
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  primaryBtn: {
    borderRadius: radii.full,
    backgroundColor: colors.gold,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.background,
    textTransform: 'uppercase',
  },
  secondaryBtn: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  disabled: {
    opacity: 0.5,
  },
});
