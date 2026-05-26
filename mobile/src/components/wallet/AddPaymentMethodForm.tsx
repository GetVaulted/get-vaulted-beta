import { Ionicons } from '@expo/vector-icons';
import { CardField, StripeProvider, confirmSetupIntent } from '@stripe/stripe-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { createBuyerSetupIntent } from '../../api/buyerWalletRepository';
import { colors, radii, spacing } from '../../theme';
import { LiveRoomText } from '../live/LiveRoomText';

type Props = {
  accessToken?: string;
  onBack: () => void;
  onSaved: () => void;
};

export function AddPaymentMethodForm({ accessToken, onBack, onSaved }: Props) {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setError('Sign in to add a payment method.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const payload = await createBuyerSetupIntent(accessToken);
        if (cancelled) return;
        setPublishableKey(payload.publishableKey);
        setClientSecret(payload.clientSecret);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not start card setup.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const submit = async () => {
    if (!clientSecret || !cardComplete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: stripeError } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: 'Card',
      });
      if (stripeError) {
        setError(stripeError.message ?? 'Card could not be saved.');
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Card could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={12} disabled={busy}>
          <Ionicons name="chevron-back" size={22} color={colors.gold} />
        </Pressable>
        <LiveRoomText style={styles.title}>Add payment method</LiveRoomText>
        <View style={styles.headerSpacer} />
      </View>

      <LiveRoomText style={styles.body}>
        Save a debit or credit card for live bids and auction wins. Your card is stored securely with Stripe.
      </LiveRoomText>

      {error ? <LiveRoomText style={styles.error}>{error}</LiveRoomText> : null}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.gold} />
          <LiveRoomText style={styles.loadingText}>Preparing secure card entry…</LiveRoomText>
        </View>
      ) : publishableKey && clientSecret ? (
        <CardField
          postalCodeEnabled
          placeholders={{ number: '4242 4242 4242 4242' }}
          cardStyle={{
            backgroundColor: '#0a0a0d',
            textColor: '#ffffff',
            placeholderColor: 'rgba(255,255,255,0.35)',
            borderColor: 'rgba(212,175,55,0.35)',
            borderWidth: 1,
            borderRadius: 8,
          }}
          style={styles.cardField}
          onCardChange={(details) => setCardComplete(details.complete)}
        />
      ) : null}

      <Pressable
        style={[styles.saveBtn, (busy || loading || !cardComplete) && styles.saveBtnDisabled]}
        onPress={() => void submit()}
        disabled={busy || loading || !cardComplete}
      >
        {busy ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <LiveRoomText style={styles.saveBtnText}>Save card</LiveRoomText>
        )}
      </Pressable>
    </>
  );

  if (publishableKey) {
    return <StripeProvider publishableKey={publishableKey}>{content}</StripeProvider>;
  }
  return content;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerSpacer: { width: 22 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: spacing.sm,
  },
  error: { color: '#fca5a5', fontSize: 12, fontWeight: '600', marginBottom: spacing.sm },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  cardField: {
    width: '100%',
    height: 50,
    marginVertical: spacing.xs,
  },
  saveBtn: {
    marginTop: spacing.md,
    minHeight: 46,
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: '#0a0a0a', fontSize: 14, fontWeight: '900' },
});
