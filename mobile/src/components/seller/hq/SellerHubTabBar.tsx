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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.brandRow}>
        <Text style={styles.brandKicker}>Get Vaulted</Text>
        <Text style={styles.brandTitle}>Seller Studio</Text>
      </View>
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
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                {t.label}
              </Text>
              {on ? <View style={styles.tabIndicator} /> : <View style={styles.tabIndicatorSpacer} />}
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
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.background,
  },
  brandRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  brandKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingRight: spacing.xl,
    gap: spacing.lg,
  },
  tab: {
    paddingBottom: spacing.sm,
    minHeight: 40,
    justifyContent: 'flex-end',
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    paddingBottom: 6,
  },
  tabTextOn: {
    color: colors.textPrimary,
  },
  tabIndicator: {
    height: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  tabIndicatorSpacer: {
    height: 2,
  },
});
