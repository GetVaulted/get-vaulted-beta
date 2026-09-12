import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../../theme';
import { hq } from './hqStyles';

export type TodayItem = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: 'gold' | 'live' | 'warn';
};

const URGENT_TONES = new Set<TodayItem['tone']>(['live', 'warn']);

function Row({ item, onPress }: { item: TodayItem; onPress?: (id: string) => void }) {
  const urgent = URGENT_TONES.has(item.tone);
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => onPress?.(item.id)}
      disabled={!onPress}
    >
      <View style={[styles.sev, urgent ? styles.sevUrgent : styles.sevInfo]} />
      <View
        style={[
          styles.iconBubble,
          item.tone === 'gold' && styles.iconGold,
          item.tone === 'warn' && styles.iconWarn,
          item.tone === 'live' && styles.iconLive,
        ]}
      >
        <Ionicons name={item.icon} size={17} color={item.tone === 'warn' ? '#FFB340' : colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.lbl}>{item.label}</Text>
        <Text style={styles.val} numberOfLines={2}>
          {item.value}
        </Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export function SellerHQTodayInVault({
  items,
  onPressItem,
}: {
  items: TodayItem[];
  onPressItem?: (id: string) => void;
}) {
  const urgent = items.filter((i) => URGENT_TONES.has(i.tone));
  const upcoming = items.filter((i) => !URGENT_TONES.has(i.tone));

  return (
    <View style={styles.wrap}>
      <Text style={hq.sectionEyebrow}>Today</Text>
      <Text style={hq.sectionTitle}>Needs attention</Text>
      <View style={[styles.list, hq.goldCard]}>
        {urgent.length > 0 ? (
          <>
            <Text style={[styles.grpLabel, styles.grpLabelUrgent]}>Urgent</Text>
            {urgent.map((item, i) => (
              <View key={item.id} style={i > 0 ? styles.rowBorder : undefined}>
                <Row item={item} onPress={onPressItem} />
              </View>
            ))}
          </>
        ) : null}
        {upcoming.length > 0 ? (
          <>
            <Text style={[styles.grpLabel, urgent.length > 0 && styles.grpLabelSpaced]}>Upcoming</Text>
            {upcoming.map((item, i) => (
              <View key={item.id} style={i > 0 ? styles.rowBorder : undefined}>
                <Row item={item} onPress={onPressItem} />
              </View>
            ))}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  list: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  grpLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  grpLabelUrgent: { color: '#FF9E8A' },
  grpLabelSpaced: { marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  pressed: { opacity: 0.88 },
  sev: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  sevUrgent: { backgroundColor: colors.live },
  sevInfo: { backgroundColor: colors.gold },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGold: { backgroundColor: 'rgba(212,175,55,0.12)' },
  iconWarn: { backgroundColor: 'rgba(255,149,0,0.12)' },
  iconLive: { backgroundColor: colors.liveGlow },
  lbl: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  val: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
});
