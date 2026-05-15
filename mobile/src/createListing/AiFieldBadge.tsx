import { StyleSheet, Text, View } from 'react-native';
import type { AiFieldConfidence } from './types';
import { colors, radii, spacing } from '../theme';

const LABELS: Record<AiFieldConfidence, string> = {
  ai_suggestion: 'AI suggestion',
  confirmed: 'Confirm details',
  needs_review: 'Needs review',
};

export function AiFieldBadge({ status }: { status: AiFieldConfidence | undefined }) {
  if (!status) return null;
  return (
    <View style={[styles.pill, status === 'needs_review' && styles.pillWarn, status === 'confirmed' && styles.pillOk]}>
      <Text style={[styles.txt, status === 'needs_review' && styles.txtWarn, status === 'confirmed' && styles.txtOk]}>
        {LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    marginBottom: spacing.xs,
  },
  pillWarn: {
    backgroundColor: 'rgba(255,149,0,0.12)',
    borderColor: 'rgba(255,149,0,0.35)',
  },
  pillOk: {
    backgroundColor: 'rgba(52,199,89,0.1)',
    borderColor: 'rgba(52,199,89,0.35)',
  },
  txt: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  txtWarn: { color: '#FFB340' },
  txtOk: { color: colors.success },
});
