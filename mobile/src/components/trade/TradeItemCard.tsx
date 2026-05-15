import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { TradeItem } from '../../trade/tradeDisplayTypes';
import { colors, radii, spacing, typography } from '../../theme';

type Props = {
  item: TradeItem;
  /** e.g. "They want from you" / "They offer" */
  caption?: string;
};

export function TradeItemCard({ item, caption }: Props) {
  return (
    <View style={styles.wrap}>
      {caption ? (
        <Text style={styles.caption}>{caption}</Text>
      ) : null}
      <View style={styles.card}>
        <Image source={{ uri: item.imageUrl }} style={styles.img} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.meta}>{item.conditionGrade}</Text>
          <Text style={styles.val}>Est. value {item.estValue}</Text>
          <Text style={styles.auth}>{item.authStatus}</Text>
          <View style={styles.badges}>
            {item.vaultedVerified ? (
              <View style={styles.vv}>
                <Ionicons name="shield-checkmark" size={12} color={colors.gold} />
                <Text style={styles.vvTxt}>Vaulted Verified</Text>
              </View>
            ) : (
              <View style={styles.pillMuted}>
                <Text style={styles.pillMutedTxt}>Standard listing</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  caption: {
    ...typography.micro,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  img: {
    width: 96,
    height: 96,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  meta: { color: colors.textSecondary, fontSize: 13 },
  val: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 4 },
  auth: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  vv: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  vvTxt: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  pillMuted: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pillMutedTxt: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
});
