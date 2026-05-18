import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export function HomeLiveActivityStrip({
  items,
}: {
  items: readonly { id: string; text: string; time: string }[];
}) {
  return (
    <View style={styles.wrap}>
      {items.map((item, i) => (
        <View key={item.id} style={[styles.row, i < items.length - 1 && styles.rowBorder]}>
          <View style={styles.dot} />
          <Text style={styles.txt} numberOfLines={1}>
            {item.text}
          </Text>
          <Text style={styles.time}>{item.time}</Text>
        </View>
      ))}
      <View style={styles.footer}>
        <Ionicons name="pulse" size={14} color={colors.gold} />
        <Text style={styles.footerTxt}>Live community pulse</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  txt: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  time: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(212,175,55,0.04)',
  },
  footerTxt: { fontSize: 11, fontWeight: '700', color: colors.gold },
});
