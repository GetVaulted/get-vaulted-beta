import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  hero: ReactNode;
  children?: ReactNode;
  first?: boolean;
};

export function HomePremiumShowcase({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onAction,
  hero,
  children,
  first,
}: Props) {
  return (
    <View style={[styles.wrap, first && styles.wrapFirst]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={10} style={styles.actionBtn}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {hero}
      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xl + 4,
    gap: spacing.md,
  },
  wrapFirst: {
    marginTop: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(212,175,55,0.72)',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    lineHeight: 18,
  },
  actionBtn: {
    paddingTop: 6,
  },
  action: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gold,
  },
  body: {
    gap: spacing.sm,
  },
});
