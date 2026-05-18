import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { createDispute } from '../../platform/platformStore';
import type { DisputeType } from '../../platform/types';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

const TYPES: { id: DisputeType; label: string }[] = [
  { id: 'not_received', label: 'Not received' },
  { id: 'not_as_described', label: 'Not as described' },
  { id: 'damaged', label: 'Damaged' },
  { id: 'counterfeit', label: 'Authenticity concern' },
  { id: 'payment', label: 'Payment issue' },
  { id: 'trade_issue', label: 'Trade issue' },
  { id: 'other', label: 'Other' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'OpenDispute'>;

export function OpenDisputeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [disputeType, setDisputeType] = useState<DisputeType>('not_as_described');
  const [explanation, setExplanation] = useState('');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user?.id) return;
    if (!explanation.trim()) {
      Alert.alert('Explanation required', 'Describe the issue with evidence details.');
      return;
    }
    setBusy(true);
    try {
      const d = await createDispute({
        userId: user.id,
        contextType: route.params.contextType,
        disputeType,
        referenceId: route.params.referenceId,
        explanation: explanation.trim(),
        preferredResolution: resolution.trim() || 'Fair resolution per vault policy',
      });
      Alert.alert('Dispute submitted', 'Our trust team will review your case.', [
        { text: 'View dispute', onPress: () => navigation.replace('DisputeDetail', { disputeId: d.id }) },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="Open dispute"
        subtitle="Protected review — serious issues only"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.serious}>
          <Text style={styles.seriousTxt}>
            Disputes are for significant issues on orders, trades, or live purchases. For general questions, use
            Contact Support.
          </Text>
        </View>
        <Text style={styles.label}>Dispute type</Text>
        <View style={styles.chips}>
          {TYPES.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setDisputeType(t.id)}
              style={[styles.chip, disputeType === t.id && styles.chipOn]}
            >
              <Text style={[styles.chipTxt, disputeType === t.id && styles.chipTxtOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Explanation</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={explanation}
          onChangeText={setExplanation}
          multiline
          placeholder="What happened? Include dates and details."
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.label}>Preferred resolution</Text>
        <TextInput
          style={styles.input}
          value={resolution}
          onChangeText={setResolution}
          placeholder="Refund, return, partial credit…"
          placeholderTextColor={colors.textMuted}
        />
        <View style={styles.evidence}>
          <Text style={styles.evidenceTxt}>Evidence upload — coming in a vault update</Text>
        </View>
        <Pressable style={[styles.btn, busy && styles.btnOff]} disabled={busy} onPress={() => void submit()}>
          <Text style={styles.btnTxt}>Submit dispute</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  serious: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
    backgroundColor: 'rgba(255,59,48,0.08)',
  },
  seriousTxt: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { borderColor: colors.live, backgroundColor: 'rgba(255,59,48,0.1)' },
  chipTxt: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  chipTxtOn: { color: colors.live },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  area: { minHeight: 100, textAlignVertical: 'top' },
  evidence: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
  },
  evidenceTxt: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.live,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnOff: { opacity: 0.6 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
