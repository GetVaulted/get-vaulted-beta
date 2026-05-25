import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

export function SettingsSectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, marginBottom: spacing.xs, paddingHorizontal: spacing.xs },
  title: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
});
