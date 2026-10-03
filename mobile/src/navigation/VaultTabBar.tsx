import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_GLOW_PAD } from '../lib/mainTabBarMetrics';
import { resolvedBottomInset } from '../lib/screenSafeInsets';
import { isCompactMarketplaceLayout, marketplaceFontSize, MARKETPLACE_TEXT_PROPS } from '../lib/marketplaceUiScale';
import { colors, spacing, typography } from '../theme';
import type { MainTabParamList } from './types';
import { LiveTabOrb } from './LiveTabOrb';

const ORDER: (keyof MainTabParamList)[] = ['Home', 'Marketplace', 'Live', 'TradeCenter', 'HQ'];
const TAB_SLOT_TIGHT_WIDTH = 88;
const TAB_COUNT = ORDER.length;

function iconFor(
  name: keyof MainTabParamList,
  focused: boolean,
): keyof typeof Ionicons.glyphMap {
  switch (name) {
    case 'Home':
      return focused ? 'home' : 'home-outline';
    case 'Marketplace':
      return focused ? 'storefront' : 'storefront-outline';
    case 'Live':
      return 'radio';
    case 'TradeCenter':
      return focused ? 'swap-horizontal' : 'swap-horizontal-outline';
    case 'HQ':
      return focused ? 'briefcase' : 'briefcase-outline';
    default:
      return 'ellipse';
  }
}

function tabLabelFor(name: keyof MainTabParamList, compact: boolean): string {
  if (name === 'Marketplace') return compact ? 'Vault' : 'Marketplace';
  if (name === 'HQ') return compact ? 'HQ' : 'Seller HQ';
  if (name === 'TradeCenter') return 'Trade';
  return name;
}

export function VaultTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = isCompactMarketplaceLayout(width, height);
  const tightTabs = width / ORDER.length < TAB_SLOT_TIGHT_WIDTH;
  const shortLabels = compact || tightTabs;
  const labelSize = marketplaceFontSize(shortLabels ? 9 : 10, Math.min(1, width / 430));
  const bottomPad = resolvedBottomInset(insets.bottom) + spacing.sm;
  const tabSlotWidth = width / TAB_COUNT;
  const rowPadTop = compact ? 10 : 12;
  const currentRoute = state.routes[state.index];
  const nestedLiveName =
    currentRoute?.name === 'Live'
      ? getFocusedRouteNameFromRoute(currentRoute) ?? 'LiveDiscovery'
      : null;
  const nestedTradeName =
    currentRoute?.name === 'TradeCenter'
      ? getFocusedRouteNameFromRoute(currentRoute) ?? 'TradeCenterHome'
      : null;
  const hideTabBar =
    nestedLiveName === 'LiveRoom' ||
    (currentRoute?.name === 'TradeCenter' && nestedTradeName !== 'TradeCenterHome');

  if (hideTabBar) {
    return <View style={{ height: 0 }} />;
  }

  return (
    <View style={[styles.chrome, { paddingBottom: bottomPad }]}>
      {/* Dark bar starts below the glow pad so the bloom can sit in transparent space. */}
      <View style={[styles.barFill, { top: TAB_BAR_GLOW_PAD }]} pointerEvents="none" />
      <View style={[styles.row, { paddingTop: TAB_BAR_GLOW_PAD + rowPadTop }]}>
        {ORDER.map((name) => {
          const route = state.routes.find((r) => r.name === name);
          if (!route) return null;
          const isFocused = state.index === state.routes.indexOf(route);
          const { options } = descriptors[route.key];

          if (name === 'Live') {
            return (
              <LiveTabOrb
                key={route.key}
                isFocused={isFocused}
                slotWidth={tabSlotWidth}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (event.defaultPrevented) return;
                  navigation.navigate('Live', { screen: 'LiveDiscovery' });
                }}
              />
            );
          }

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (event.defaultPrevented) return;
            if (isFocused) {
              if (route.name === 'TradeCenter') {
                navigation.navigate('TradeCenter', { screen: 'TradeCenterHome' });
              }
              return;
            }
            if (route.name === 'TradeCenter') {
              navigation.navigate('TradeCenter', { screen: 'TradeCenterHome' });
            } else {
              navigation.navigate(route.name, route.params);
            }
          };

          const lblColor = isFocused ? colors.gold : colors.textMuted;
          const labelNode =
            name === 'TradeCenter' && !shortLabels ? (
              <View style={styles.tabLabelStack}>
                <Text style={[styles.label, styles.labelStackLine, { color: lblColor, fontSize: labelSize - 1.5 }]} {...MARKETPLACE_TEXT_PROPS}>
                  Trade
                </Text>
                <Text style={[styles.label, styles.labelStackLine, { color: lblColor, fontSize: labelSize - 1.5 }]} {...MARKETPLACE_TEXT_PROPS}>
                  Center
                </Text>
              </View>
            ) : (
              <Text
                style={[styles.label, { color: lblColor, fontSize: labelSize }]}
                numberOfLines={1}
                ellipsizeMode="tail"
                {...MARKETPLACE_TEXT_PROPS}
              >
                {tabLabelFor(name, shortLabels)}
              </Text>
            );

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              hitSlop={{ top: 8, bottom: 6, left: 4, right: 4 }}
              style={({ pressed }) => [styles.tabSlot, pressed && styles.pressed]}
            >
              <Ionicons
                name={iconFor(name, isFocused)}
                size={compact ? 20 : 22}
                color={isFocused ? colors.gold : colors.textMuted}
              />
              {labelNode}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    backgroundColor: 'transparent',
    overflow: 'visible',
    zIndex: 100,
  },
  barFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,5,5,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    overflow: 'visible',
    zIndex: 1,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    gap: 2,
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 1,
    backgroundColor: 'transparent',
  },
  label: {
    ...typography.micro,
    letterSpacing: 0.35,
    textAlign: 'center',
    maxWidth: '100%',
  },
  tabLabelStack: {
    alignItems: 'center',
    gap: 0,
    marginTop: -1,
  },
  labelStackLine: {
    fontSize: 8.5,
    lineHeight: 10,
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.88,
  },
});
