import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

type Props = {
  title: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  /** First section on screen — no extra top margin. */
  first?: boolean;
};

export function HomeFeedSection({ title, eyebrow, actionLabel, onAction, children, first }: Props) {
  return (
    <View style={[styles.wrap, first && styles.wrapFirst]}>
      <View style={styles.head}>
        <View style={styles.titles}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
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
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  wrapFirst: {
    marginTop: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.38)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.35,
    color: colors.textPrimary,
  },
  action: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gold,
    paddingBottom: 1,
  },
});
