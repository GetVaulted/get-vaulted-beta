import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';

export type TradeCenterDeskTab = 'start' | 'block';

const TABS: { id: TradeCenterDeskTab; label: string }[] = [
  { id: 'start', label: 'Start a trade' },
  { id: 'block', label: 'Trade block' },
];

export function TradeCenterDeskTabs({
  tab,
  onTabChange,
  blockCount,
}: {
  tab: TradeCenterDeskTab;
  onTabChange: (tab: TradeCenterDeskTab) => void;
  blockCount: number;
}) {
  return (
    <View style={styles.shell}>
      {TABS.map((t) => {
        const active = tab === t.id;
        const showBadge = t.id === 'block' && blockCount > 0;
        return (
          <Pressable
            key={t.id}
            onPress={() => onTabChange(t.id)}
            style={[styles.tab, active && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{t.label}</Text>
            {showBadge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{blockCount > 99 ? '99+' : blockCount}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 4,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  tabActive: {
    backgroundColor: 'rgba(212,175,55,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.32)',
  },
  tabTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  tabTxtActive: {
    color: colors.gold,
    fontWeight: '800',
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.gold,
  },
});
