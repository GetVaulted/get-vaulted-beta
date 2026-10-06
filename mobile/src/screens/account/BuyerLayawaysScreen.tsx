import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchBuyerLayaways, startLayawayPayment, type LayawayRow } from '../../api/layawayRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useAuth } from '../../auth/AuthContext';
import { useCanonicalUserId } from '../../hooks/useCanonicalUserId';
import { useMoneyStateSync } from '../../hooks/useMoneyStateSync';
import { parseLayawayPaymentAmount } from '../../lib/layawayPaymentAmount';
import { openWebCommerceUrl } from '../../lib/openWebCommerce';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyerLayaways'>;

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function BuyerLayawaysScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session, user } = useAuth();
  const canonicalUserId = useCanonicalUserId(session?.access_token);
  const [rows, setRows] = useState<LayawayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session?.access_token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchBuyerLayaways(session.access_token);
    setRows(data);
    setLoading(false);
  }, [session?.access_token]);

  useMoneyStateSync({
    enabled: Boolean(session?.access_token && user?.id),
    canonicalUserId,
    supabaseUserId: user?.id,
    refetch: load,
  });

  const startPayment = async (row: LayawayRow, opts: { amountUsd?: number; payRemaining?: boolean }) => {
    if (!session?.access_token) return;
    setPayingId(row.id);
    try {
      const url = await startLayawayPayment(session.access_token, row.id, opts);
      if (url) {
        await openWebCommerceUrl(url);
      } else {
        Alert.alert('Payment could not start', 'Please try again in a moment.');
      }
    } finally {
      setPayingId(null);
    }
  };

  const payRemaining = (row: LayawayRow) => startPayment(row, { payRemaining: true });

  const payAmount = (row: LayawayRow) => {
    const parsed = parseLayawayPaymentAmount(amountInputs[row.id] ?? '', row.remainingBalanceUsd);
    if (!parsed.ok) {
      Alert.alert('Layaway payment', parsed.error);
      return;
    }
    // Typing the full balance is just paying it off.
    if (parsed.amountUsd >= row.remainingBalanceUsd - 0.005) {
      void payRemaining(row);
      return;
    }
    void startPayment(row, { amountUsd: parsed.amountUsd });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="My layaways" subtitle="Deposit + pay over time" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No layaways yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {rows.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.title}>{r.listingTitle}</Text>
              <Text style={styles.meta}>
                Paid {formatMoney(r.amountPaidUsd)} · {formatMoney(r.remainingBalanceUsd)} remaining
              </Text>
              <Text style={styles.meta}>Due {new Date(r.dueAt).toLocaleDateString()}</Text>
              {(r.canMakePayment ?? (r.status === 'active' && r.remainingBalanceUsd > 0)) ? (
                <>
                  <Text style={styles.label}>Make a payment</Text>
                  <View style={styles.amountRow}>
                    <TextInput
                      style={styles.amountInput}
                      value={amountInputs[r.id] ?? ''}
                      onChangeText={(t) => setAmountInputs((prev) => ({ ...prev, [r.id]: t }))}
                      placeholder={`Up to ${formatMoney(r.remainingBalanceUsd)}`}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      editable={payingId !== r.id}
                    />
                    <Pressable
                      style={[styles.partialBtn, payingId === r.id && styles.payBtnOff]}
                      onPress={() => payAmount(r)}
                      disabled={payingId === r.id}
                    >
                      <Text style={styles.partialTxt}>Pay amount</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    style={[styles.payBtn, payingId === r.id && styles.payBtnOff]}
                    onPress={() => void payRemaining(r)}
                    disabled={payingId === r.id}
                  >
                    <Text style={styles.payTxt}>{payingId === r.id ? 'Opening checkout…' : 'Pay remaining balance'}</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: { color: colors.textPrimary, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.textSecondary, fontSize: 13 },
  label: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  amountRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  amountInput: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  partialBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  partialTxt: { color: colors.gold, fontWeight: '700', fontSize: 14 },
  payBtn: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  payBtnOff: { opacity: 0.6 },
  payTxt: { color: colors.background, fontWeight: '700', fontSize: 14 },
});
