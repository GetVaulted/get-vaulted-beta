import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SellerLayawayCounts } from '../../../api/layawayRepository';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

type Props = {
  counts: SellerLayawayCounts | null;
  loading: boolean;
  /** When true, always render the section (layaway records exist). */
  hasLayaways: boolean;
  onPress: () => void;
  onPressFilter?: (filter: 'active' | 'ready' | 'overdue') => void;
};

function CountPill({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  tone?: 'gold' | 'warn' | 'live';
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.pill, tone === 'warn' && styles.pillWarn, tone === 'live' && styles.pillLive]}>
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
  if (!onPress || value === 0) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

export function SellerHQLayawaysCard({ counts, loading, hasLayaways, onPress, onPressFilter }: Props) {
  if (!hasLayaways && !loading) return null;

  if (loading && !hasLayaways) {
    return (
      <View style={[styles.card, hq.goldCard]}>
        <ActivityIndicator color={colors.gold} />
        <Text style={styles.sub}>Loading layaway sales…</Text>
      </View>
    );
  }

  return (
    <Pressable style={({ pressed }) => [styles.card, hq.goldCard, pressed && { opacity: 0.92 }]} onPress={onPress}>
      <View style={styles.head}>
        <Ionicons name="time-outline" size={22} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Layaways</Text>
          <Text style={styles.sub}>Reserved sales — shipping unlocks when paid in full</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>
      <View style={styles.pillRow}>
        <CountPill
          label="Active"
          value={counts?.active ?? 0}
          tone="gold"
          onPress={onPressFilter ? () => onPressFilter('active') : undefined}
        />
        <CountPill
          label="Ready to ship"
          value={counts?.readyToShip ?? 0}
          tone="live"
          onPress={onPressFilter ? () => onPressFilter('ready') : undefined}
        />
        <CountPill
          label="Overdue"
          value={counts?.overdueOrDefaulted ?? 0}
          tone="warn"
          onPress={onPressFilter ? () => onPressFilter('overdue') : undefined}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.06)',
    alignItems: 'center',
  },
  pillWarn: { borderColor: 'rgba(255,138,128,0.35)', backgroundColor: 'rgba(255,138,128,0.08)' },
  pillLive: { borderColor: 'rgba(76,217,123,0.35)', backgroundColor: 'rgba(76,217,123,0.08)' },
  pillValue: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  pillLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginTop: 2 },
});
