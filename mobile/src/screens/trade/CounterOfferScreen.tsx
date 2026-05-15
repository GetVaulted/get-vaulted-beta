import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TradeFlowHeader } from '../../components/trade/TradeFlowHeader';
import { TradeItemCard } from '../../components/trade/TradeItemCard';
import type { TradeCenterStackParamList } from '../../navigation/types';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuth } from '../../auth/AuthContext';
import { useTradeOffer } from '../../hooks/useTradeOffer';
import { listingToTradeItem } from '../../trade/listingToTradeItem';
import { submitCounterOffer } from '../../api/tradeOffersRepository';
import { isSupabaseConfigured } from '../../lib/supabase';

type Props = NativeStackScreenProps<TradeCenterStackParamList, 'CounterOffer'>;

export function CounterOfferScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { offer, loading } = useTradeOffer(route.params.offerId);
  const [cashNote, setCashNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading || !offer) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <TradeFlowHeader navigation={navigation} title="Counter" subtitle="Loading…" />
      </View>
    );
  }

  const sendCounter = async () => {
    const cash = cashNote.trim() === '' ? offer.cash_difference : Number(cashNote);
    if (!Number.isFinite(cash)) {
      Alert.alert('Cash amount', 'Enter a numeric cash adjustment (USD).');
      return;
    }
    if (!user) {
      Alert.alert('Sign in', 'Authenticate on Trade Center home first.');
      return;
    }
    if (!isSupabaseConfigured()) {
      Alert.alert(
        'Not available',
        'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to use counters.',
      );
      return;
    }
    if (offer.recipient_id !== user.id) {
      Alert.alert('Not your turn', 'Only the recipient can counter from this lane in MVP.');
      return;
    }
    setBusy(true);
    try {
      await submitCounterOffer({
        offerId: offer.id,
        recipientId: user.id,
        message: message.trim() || offer.message || '',
        cashDifference: cash,
      });
      Alert.alert('Counter sent', 'The other party will see your revised terms.', [
        { text: 'OK', onPress: () => navigation.popToTop() },
      ]);
    } catch (e) {
      Alert.alert('Counter failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <TradeFlowHeader
        navigation={navigation}
        title="Counter offer"
        subtitle="Adjust cash · message · items (MVP: message + cash)"
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          Your counter updates the open trade row. Item swaps stay on the roadmap — today you revise cash and the
          message only.
        </Text>

        <Text style={styles.section}>They wanted</Text>
        <TradeItemCard item={listingToTradeItem(offer.requested)} />

        <Text style={styles.section}>They offered</Text>
        {offer.offered.map((i) => (
          <View key={i.id} style={{ marginBottom: spacing.md }}>
            <TradeItemCard item={listingToTradeItem(i)} />
          </View>
        ))}

        <Text style={styles.section}>Cash adjustment (total USD sender → recipient)</Text>
        <TextInput
          style={styles.input}
          placeholder={`Current: ${offer.cash_difference}`}
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={cashNote}
          onChangeText={setCashNote}
        />

        <Text style={styles.section}>Message</Text>
        <TextInput
          style={[styles.input, styles.inputTall]}
          placeholder="Counter narrative"
          placeholderTextColor={colors.textMuted}
          multiline
          value={message}
          onChangeText={setMessage}
        />

        <Pressable style={[styles.primary, busy && { opacity: 0.7 }]} disabled={busy} onPress={() => void sendCounter()}>
          <Text style={styles.primaryTxt}>{busy ? 'Sending…' : 'Send counter'}</Text>
        </Pressable>
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxl, gap: spacing.md },
  lead: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  section: {
    ...typography.micro,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.md,
  },
  input: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    backgroundColor: colors.surfaceElevated,
  },
  inputTall: { minHeight: 100, textAlignVertical: 'top' },
  primary: {
    marginTop: spacing.xl,
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  primaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
});
