import { useCallback, useEffect, useRef } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SELLER_HUB_TABS, type SellerHubTabId } from '../../../data/sellerHubMock';
import { colors, radii, spacing } from '../../../theme';

type TabLayout = { x: number; width: number };

export function SellerHubTabBar({
  activeTab,
  onChangeTab,
}: {
  activeTab: SellerHubTabId;
  onChangeTab: (id: SellerHubTabId) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const layoutsRef = useRef<Partial<Record<SellerHubTabId, TabLayout>>>({});

  const scrollTabIntoView = useCallback(
    (id: SellerHubTabId) => {
      const layout = layoutsRef.current[id];
      if (!layout || !scrollRef.current) return;
      const targetX = Math.max(0, layout.x - (screenWidth - layout.width) / 2);
      scrollRef.current.scrollTo({ x: targetX, animated: true });
    },
    [screenWidth],
  );

  useEffect(() => {
    scrollTabIntoView(activeTab);
  }, [activeTab, scrollTabIntoView]);

  const onTabLayout = useCallback(
    (id: SellerHubTabId) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      layoutsRef.current[id] = { x, width };
      if (id === activeTab) scrollTabIntoView(id);
    },
    [activeTab, scrollTabIntoView],
  );

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces
        alwaysBounceHorizontal
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {SELLER_HUB_TABS.map((t) => {
          const on = activeTab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => onChangeTab(t.id)}
              onLayout={onTabLayout(t.id)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingRight: spacing.xl,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextOn: {
    color: colors.gold,
  },
});
