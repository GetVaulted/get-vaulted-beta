import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { createTradeCashCheckoutViaWeb, isWebTradeApiConfigured } from '../../api/tradeOffersWebApi';
import { colors, radii, spacing } from '../../theme';

/** Pay optional trade cash via Stripe (separate from fee + label). */
export function TradeCashPayButton({
  offerId,
  amountUsd,
  payeeHandle,
  alreadyPaid,
  onPaid,
}: {
  offerId: string;
  amountUsd: number;
  payeeHandle: string | null;
  alreadyPaid: boolean;
  onPaid?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  if (alreadyPaid || amountUsd <= 0) {
    return (
      <Text style={styles.paid}>
        Trade cash (${amountUsd.toFixed(2)}) is paid
        {payeeHandle ? ` for ${payeeHandle}` : ''} and held until both confirm receipt.
      </Text>
    );
  }

  const onPay = async () => {
    if (!isWebTradeApiConfigured()) {
      Alert.alert('Cash checkout', 'Connect to Get Vaulted web API to pay trade cash on-platform.');
      return;
    }
    setBusy(true);
    try {
      const result = await createTradeCashCheckoutViaWeb(offerId);
      if (result.alreadyPaid) {
        Alert.alert('Already paid', 'Trade cash is already recorded.');
        await onPaid?.();
        return;
      }
      if (!result.url) throw new Error('Checkout URL missing.');
      await WebBrowser.openBrowserAsync(result.url);
      await onPaid?.();
    } catch (e) {
      Alert.alert('Cash checkout failed', e instanceof Error ? e.message : 'Unknown error');
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
          <Text style={styles.btnTxt}>
            Pay ${amountUsd.toFixed(2)} cash{payeeHandle ? ` to ${payeeHandle}` : ''}
          </Text>
        )}
      </Pressable>
      <Text style={styles.hint}>
        Separate from the platform fee + shipping label. Stripe card fees apply. Get Vaulted holds this cash until
        both of you confirm receipt (or an admin resolves a dispute), then releases it to your partner.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  btn: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.35)',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnTxt: { color: '#d1fae5', fontWeight: '800', fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  paid: { color: '#a7f3d0', fontSize: 13, fontWeight: '700', lineHeight: 18 },
});
