import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  applyOrderShippingFromWallet,
  fetchOrderShippingFromWalletState,
  type OrderShipTo,
} from '../../api/orderShippingRepository';
import { colors, radii, spacing } from '../../theme';

type Props = {
  accessToken: string | undefined;
  orderId: string;
};

function formatShipTo(shipTo: OrderShipTo): string {
  const lines = [
    shipTo.shipRecipientName?.trim(),
    shipTo.shipAddress?.trim(),
    [shipTo.shipCity?.trim(), shipTo.shipState?.trim(), shipTo.shipZip?.trim()].filter(Boolean).join(', '),
    shipTo.shipCountry?.trim(),
  ].filter(Boolean);
  return lines.join('\n');
}

export function BuyerOrderShipToSection({ accessToken, orderId }: Props) {
  const [shipTo, setShipTo] = useState<OrderShipTo | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const row = await fetchOrderShippingFromWalletState(accessToken, orderId);
      if (!row) {
        setShipTo(null);
        setCanUpdate(false);
        return;
      }
      setShipTo(row.shipTo);
      setCanUpdate(row.canUpdateFromWallet);
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!accessToken) return null;
  if (loading) {
    return <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.md }} />;
  }
  if (!shipTo) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Ship to</Text>
      <Text style={styles.address}>{formatShipTo(shipTo)}</Text>
      {canUpdate ? (
        <Pressable
          disabled={busy}
          onPress={() => {
            Alert.alert(
              'Update shipping address?',
              'This replaces the order ship-to with your current Wallet address. Only works before a label is created.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Update',
                  onPress: () => {
                    void (async () => {
                      setBusy(true);
                      setMessage(null);
                      try {
                        const result = await applyOrderShippingFromWallet(accessToken, orderId);
                        if (!result.ok) {
                          Alert.alert('Could not update', result.error);
                          return;
                        }
                        setShipTo(result.shipTo);
                        setMessage(
                          result.updated
                            ? 'Updated from your Wallet address.'
                            : 'Already matches your Wallet address.',
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  },
                },
              ],
            );
          }}
          style={({ pressed }) => [styles.btn, busy && styles.btnDisabled, pressed && !busy && styles.pressed]}
        >
          <Text style={styles.btnText}>{busy ? 'Updating…' : 'Update from Wallet'}</Text>
        </Pressable>
      ) : (
        <Text style={styles.locked}>Locked after a label is created or the order ships.</Text>
      )}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  address: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 19 },
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 13, fontWeight: '800', color: colors.gold },
  pressed: { opacity: 0.85 },
  locked: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  message: { fontSize: 12, color: '#6ee7a0', fontWeight: '600' },
});
