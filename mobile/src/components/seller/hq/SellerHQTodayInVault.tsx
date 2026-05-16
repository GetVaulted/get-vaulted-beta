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

export function SellerHQTodayInVault({
  items,
  onPressItem,
}: {
  items: TodayItem[];
  onPressItem?: (id: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={hq.sectionEyebrow}>Today in vault</Text>
      <Text style={hq.sectionTitle}>Your lane right now</Text>
      <View style={[styles.list, hq.goldCard]}>
        {items.map((item, i) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.row,
              i < items.length - 1 && styles.rowBorder,
              pressed && styles.pressed,
            ]}
            onPress={() => onPressItem?.(item.id)}
            disabled={!onPressItem}
          >
            <View
              style={[
                styles.iconBubble,
                item.tone === 'gold' && styles.iconGold,
                item.tone === 'warn' && styles.iconWarn,
                item.tone === 'live' && styles.iconLive,
              ]}
            >
              <Ionicons name={item.icon} size={18} color={colors.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.lbl}>{item.label}</Text>
              <Text style={styles.val} numberOfLines={2}>
                {item.value}
              </Text>
            </View>
            {onPressItem ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  list: { paddingHorizontal: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  pressed: { opacity: 0.88 },
  iconBubble: {
    width: 40,
    height: 40,
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
