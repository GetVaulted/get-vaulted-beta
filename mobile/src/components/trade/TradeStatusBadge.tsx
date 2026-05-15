import { StyleSheet, Text, View } from 'react-native';
import type { TradeOfferStatus } from '../../types/tradeOffers';
import { displayTradeStatus } from '../../lib/tradeStatusLabels';
import { colors, radii, typography } from '../../theme';

function toneFor(status: TradeOfferStatus): { bg: string; border: string; fg: string } {
  if (status === 'label_error' || status === 'disputed') {
    return { bg: 'rgba(220,80,80,0.12)', border: 'rgba(220,80,80,0.35)', fg: '#f0a8a8' };
  }
  if (
    status === 'fee_due' ||
    status === 'labels_pending' ||
    status === 'labels_generating' ||
    status === 'labels_generated' ||
    status === 'shipped' ||
    status === 'delivered'
  ) {
    return { bg: 'rgba(212,175,55,0.1)', border: 'rgba(212,175,55,0.35)', fg: colors.gold };
  }
  if (status === 'completed') {
    return { bg: 'rgba(120,200,160,0.12)', border: 'rgba(120,200,160,0.35)', fg: '#9fe0c1' };
  }
  return { bg: colors.surfaceElevated, border: colors.borderStrong, fg: colors.textSecondary };
}

export function TradeStatusBadge({ status }: { status: string }) {
  const t = toneFor(status as TradeOfferStatus);
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.txt, { color: t.fg }]}>{displayTradeStatus(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  txt: {
    ...typography.micro,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
