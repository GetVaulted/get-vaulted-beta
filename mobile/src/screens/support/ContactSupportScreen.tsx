import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { createSupportTicket } from '../../platform/platformStore';
import type { SupportCategory } from '../../platform/types';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

const CATEGORIES: { id: SupportCategory; label: string }[] = [
  { id: 'order', label: 'Order issue' },
  { id: 'shipping', label: 'Shipping issue' },
  { id: 'payment', label: 'Payment / payout' },
  { id: 'trade', label: 'Trade issue' },
  { id: 'live', label: 'Live show issue' },
  { id: 'account', label: 'Account issue' },
  { id: 'bug', label: 'Bug report' },
  { id: 'report_user', label: 'Report user' },
  { id: 'other', label: 'Other' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'ContactSupport'>;

export function ContactSupportScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [category, setCategory] = useState<SupportCategory>(route.params?.category ?? 'other');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState(route.params?.referenceId ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user?.id) {
      Alert.alert('Sign in required', 'Sign in to contact support.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Message required', 'Describe your issue so we can help.');
      return;
    }
    setBusy(true);
    try {
      const ticket = await createSupportTicket({
        userId: user.id,
        category,
        subject: subject.trim() || CATEGORIES.find((c) => c.id === category)?.label || 'Support request',
        message: message.trim(),
        contactEmail: user.email ?? '',
        referenceType: route.params?.referenceType,
        referenceId: reference.trim() || route.params?.referenceId,
      });
      Alert.alert('Ticket submitted', `Reference ${ticket.id}. Track status in Support Inbox.`, [
        { text: 'OK', onPress: () => navigation.replace('SupportTicketDetail', { ticketId: ticket.id }) },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Contact Support" subtitle="We respond in order received" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={[styles.chip, category === c.id && styles.chipOn]}
            >
              <Text style={[styles.chipTxt, category === c.id && styles.chipTxtOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Reference (optional)</Text>
        <TextInput
          style={styles.input}
          value={reference}
          onChangeText={setReference}
          placeholder="Order, trade, or listing ID"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.label}>Subject</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Short summary" placeholderTextColor={colors.textMuted} />
        <Text style={styles.label}>Message</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="What happened?"
          placeholderTextColor={colors.textMuted}
        />
        <Pressable style={[styles.btn, busy && styles.btnOff]} disabled={busy} onPress={() => void submit()}>
          <Text style={styles.btnTxt}>Submit ticket</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  chipTxt: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  chipTxtOn: { color: colors.gold },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  area: { minHeight: 120, textAlignVertical: 'top' },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnOff: { opacity: 0.6 },
  btnTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
});
