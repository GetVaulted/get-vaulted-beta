import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export function SettingsRow({
  label,
  sub,
  icon,
  onPress,
  destructive,
  chevron = true,
  badgeCount,
}: {
  label: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  chevron?: boolean;
  badgeCount?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={[styles.iconWrap, destructive && styles.iconDestructive]}>
        <Ionicons name={icon} size={18} color={destructive ? colors.live : colors.gold} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, destructive && styles.labelDestructive]}>{label}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <View style={styles.trailing}>
        {badgeCount && badgeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
          </View>
        ) : null}
        {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  pressed: { opacity: 0.92 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  iconDestructive: { backgroundColor: 'rgba(255,59,48,0.12)' },
  copy: { flex: 1, minWidth: 0 },
  label: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  labelDestructive: { color: colors.live },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
