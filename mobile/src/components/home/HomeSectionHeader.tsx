import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  first?: boolean;
};

export function HomeSectionHeader({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
  first,
}: Props) {
  return (
    <View style={[styles.wrap, first && styles.wrapFirst]}>
      <View style={styles.head}>
        <View style={styles.copy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={10} style={styles.actionBtn}>
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
    gap: spacing.sm + 2,
  },
  wrapFirst: {
    marginTop: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(212,175,55,0.72)',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.45,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    lineHeight: 18,
  },
  actionBtn: {
    paddingTop: 4,
  },
  action: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gold,
  },
});
