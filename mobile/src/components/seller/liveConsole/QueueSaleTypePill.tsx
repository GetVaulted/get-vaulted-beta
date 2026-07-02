import { StyleSheet, Text, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { queueSaleTypePillLabel } from '../../../lib/liveQueueSaleTypePill';
import { colors, radii } from '../../../theme';

export function QueueSaleTypePill({
  item,
  compact = false,
  inline = false,
}: {
  item: Pick<LiveRoomItemRow, 'salesFormat' | 'activeSpotCommerceMode'>;
  compact?: boolean;
  /** Sit on the same row as queue action buttons (Edit / Pin). */
  inline?: boolean;
}) {
  const label = queueSaleTypePillLabel(item);
  const buyNow = label === 'Buy Now';

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        inline && styles.pillInline,
        buyNow ? styles.pillBuyNow : styles.pillAuction,
      ]}
    >
      <Text style={[styles.txt, buyNow ? styles.txtBuyNow : styles.txtAuction]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  pillCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pillInline: {
    alignSelf: 'center',
    paddingVertical: 5,
  },
  pillAuction: {
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  pillBuyNow: {
    borderColor: 'rgba(52,199,89,0.45)',
    backgroundColor: 'rgba(52,199,89,0.12)',
  },
  txt: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  txtAuction: {
    color: colors.gold,
  },
  txtBuyNow: {
    color: colors.success,
  },
});
