import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { getDispute } from '../../platform/platformStore';
import type { Dispute } from '../../platform/types';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

const TIMELINE = ['submitted', 'under_review', 'waiting_response', 'resolved', 'closed'] as const;

type Props = NativeStackScreenProps<RootStackParamList, 'DisputeDetail'>;

export function DisputeDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setDispute(await getDispute(route.params.disputeId));
      setLoading(false);
    })();
  }, [route.params.disputeId]);

  const statusIdx = dispute ? TIMELINE.indexOf(dispute.status as (typeof TIMELINE)[number]) : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Dispute" subtitle="Protected review timeline" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={colors.gold} />
      ) : dispute ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {TIMELINE.map((step, i) => (
            <View key={step} style={styles.step}>
              <View style={[styles.dot, i <= statusIdx && styles.dotOn]} />
              <Text style={[styles.stepTxt, i <= statusIdx && styles.stepTxtOn]}>{step.replace('_', ' ')}</Text>
            </View>
          ))}
          <Text style={styles.body}>{dispute.explanation}</Text>
          <Text style={styles.res}>Preferred: {dispute.preferredResolution}</Text>
        </ScrollView>
      ) : (
        <Text style={styles.empty}>Dispute not found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.live },
  stepTxt: { fontSize: 13, color: colors.textMuted, textTransform: 'capitalize' },
  stepTxtOn: { color: colors.textPrimary, fontWeight: '700' },
  body: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginTop: spacing.md },
  res: { fontSize: 13, color: colors.textMuted },
  empty: { color: colors.textMuted },
});
