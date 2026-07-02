import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  /** First section on screen — no extra top margin. */
  first?: boolean;
};

export function HomeFeedSection({ title, actionLabel, onAction, children, first }: Props) {
  return (
    <View style={[styles.wrap, first && styles.wrapFirst]}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={10}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg + 4,
    gap: spacing.sm,
  },
  wrapFirst: {
    marginTop: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  action: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
