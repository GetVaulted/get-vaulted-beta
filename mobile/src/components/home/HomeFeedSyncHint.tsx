import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

export function HomeFeedSyncHint({ message }: { message: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.txt}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  txt: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
});
