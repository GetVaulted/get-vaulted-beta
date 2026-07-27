import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { createTradeDepositCheckoutViaWeb, isWebTradeApiConfigured } from '../api/tradeOffersWebApi';
import { colors, radii, spacing } from '../theme';

/** Pay refundable security deposit (straight / $0-cash trades). */
export function TradeDepositPayButton({
  offerId,
  amountUsd,
  alreadyPaid,
  onPaid,
}: {
  offerId: string;
  amountUsd: number;
  alreadyPaid: boolean;
  onPaid?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  if (alreadyPaid || amountUsd <= 0) {
    return (
      <Text style={styles.paid}>
        Security deposit (${amountUsd.toFixed(2)}) paid — refunded when both confirm receipt.
      </Text>
    );
  }

  const onPay = async () => {
    if (!isWebTradeApiConfigured()) {
      Alert.alert('Deposit', 'Connect to Get Vaulted web API to pay the security deposit.');
      return;
    }
    setBusy(true);
    try {
      const result = await createTradeDepositCheckoutViaWeb(offerId);
      if (result.alreadyPaid) {
        Alert.alert('Already paid', 'Your security deposit is already recorded.');
        await onPaid?.();
        return;
      }
      if (!result.url) throw new Error('Checkout URL missing.');
      await WebBrowser.openBrowserAsync(result.url);
      await onPaid?.();
    } catch (e) {
      Alert.alert('Deposit checkout failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={[styles.btn, busy && { opacity: 0.65 }]} disabled={busy} onPress={() => void onPay()}>
        {busy ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.btnTxt}>Pay ${amountUsd.toFixed(2)} refundable deposit</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>
        Required on straight trades (no cash). 25% of higher-side value ($100–$500). Held until both confirm
        receipt, then refunded. Required before mark shipped. Stripe card fees apply.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.md },
  btn: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.35)',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  btnTxt: { color: '#e0f2fe', fontWeight: '800', fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  paid: { color: '#b6f0c8', fontWeight: '700', fontSize: 14, marginBottom: spacing.md },
});
