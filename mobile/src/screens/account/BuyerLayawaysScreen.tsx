import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchBuyerLayaways, startLayawayPayment, type LayawayRow } from '../../api/layawayRepository';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useAuth } from '../../auth/AuthContext';
import { openWebCommerceUrl } from '../../lib/openWebCommerce';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BuyerLayaways'>;

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function BuyerLayawaysScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [rows, setRows] = useState<LayawayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const payRemaining = async (row: LayawayRow) => {
    if (!session?.access_token) return;
    setPayingId(row.id);
    try {
      const url = await startLayawayPayment(session.access_token, row.id, { payRemaining: true });
      if (url) await openWebCommerceUrl(url);
    } finally {
      setPayingId(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="My layaways" subtitle="Deposit + pay over time" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No layaways yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {rows.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.title}>{r.listingTitle}</Text>
              <Text style={styles.meta}>
                Paid {formatMoney(r.amountPaidUsd)} · {formatMoney(r.remainingBalanceUsd)} remaining
              </Text>
              <Text style={styles.meta}>Due {new Date(r.dueAt).toLocaleDateString()}</Text>
              {r.status === 'active' && r.remainingBalanceUsd > 0 ? (
                <Pressable
                  style={[styles.payBtn, payingId === r.id && styles.payBtnOff]}
                  onPress={() => void payRemaining(r)}
                  disabled={payingId === r.id}
                >
                  <Text style={styles.payTxt}>{payingId === r.id ? 'Opening checkout…' : 'Pay remaining balance'}</Text>
                </Pressable>
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
