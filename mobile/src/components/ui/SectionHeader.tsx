import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

type Props = {
  title: string;
  actionLabel?: string;
  onPressAction?: () => void;
  /** When true, removes default top margin (use inside padded section wrappers). */
  omitTopMargin?: boolean;
};

export function SectionHeader({ title, actionLabel, onPressAction, omitTopMargin }: Props) {
  return (
    <View style={[styles.row, omitTopMargin && styles.rowNoTop]}>
      <Text style={[typography.subtitle, styles.title]}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onPressAction} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  rowNoTop: {
    marginTop: 0,
  },
  title: {
    color: colors.textPrimary,
  },
  action: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: '600',
  },
});
