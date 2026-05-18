import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export function TradeSectionBlock({
  title,
  count,
  children,
  emptyTitle,
  emptyHint,
  emptyLink,
}: {
  title: string;
  count: number;
  children: ReactNode;
  emptyTitle: string;
  emptyHint?: string;
  /** Optional subtle inline link — not a primary CTA. */
  emptyLink?: { label: string; onPress: () => void };
}) {
  const hasItems = count > 0;

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {hasItems ? (
          <View style={styles.countPill}>
            <Text style={styles.countTxt}>{count}</Text>
          </View>
        ) : null}
      </View>
      {hasItems ? (
        <View style={styles.list}>{children}</View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          {emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null}
          {emptyLink ? (
            <Pressable onPress={emptyLink.onPress} hitSlop={8} style={styles.emptyLink}>
              <Text style={styles.emptyLinkTxt}>{emptyLink.label}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
  },
  countTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.gold,
  },
  list: { gap: spacing.sm },
  empty: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  emptyHint: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    lineHeight: 17,
    opacity: 0.85,
  },
  emptyLink: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  emptyLinkTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
