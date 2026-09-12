import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { UserAvatar } from '../../ui/UserAvatar';
import { colors, spacing } from '../../../theme';

type Props = {
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  rankLabel: string;
};

/** Slim identity strip — business metrics now live in SellerHQRevenuePaceCard / SellerHQPerformanceKpiRow below. */
export function SellerHQCommandHeader({ displayName, handle, avatarUrl, rankLabel }: Props) {
  return (
    <View style={styles.top}>
      <UserAvatar
        uri={avatarUrl}
        name={displayName}
        username={handle}
        size={46}
        tone="light"
        borderColor="rgba(212,175,55,0.35)"
        borderWidth={1}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rankRow}>
          <Ionicons name="diamond-outline" size={11} color={colors.gold} />
          <Text style={styles.rank}>{rankLabel}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          {handle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rank: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  name: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  handle: { fontSize: 11.5, color: colors.textMuted, marginTop: 0 },
});
