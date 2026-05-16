import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme';
import type { MainTabParamList } from './types';
import { LiveTabOrb } from './LiveTabOrb';

const ORDER: (keyof MainTabParamList)[] = ['Home', 'Discover', 'Live', 'TradeCenter', 'HQ'];

function iconFor(
  name: keyof MainTabParamList,
  focused: boolean,
): keyof typeof Ionicons.glyphMap {
  switch (name) {
    case 'Home':
      return focused ? 'home' : 'home-outline';
    case 'Discover':
      return focused ? 'compass' : 'compass-outline';
    case 'Live':
      return 'radio';
    case 'TradeCenter':
      return focused ? 'swap-horizontal' : 'swap-horizontal-outline';
    case 'HQ':
      return focused ? 'storefront' : 'storefront-outline';
    default:
      return 'ellipse';
  }
}

export function VaultTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.sm);
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
    <View style={[styles.bar, { paddingBottom: bottomPad, paddingTop: 18 }]}>
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
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={() =>
                navigation.navigate('Live', {
                  screen: 'LiveDiscovery',
                })
              }
            />
          );
        }

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (isFocused) {
            if (route.name === 'Live') {
              navigation.navigate('Live', { screen: 'LiveDiscovery' });
            } else if (route.name === 'TradeCenter') {
              navigation.navigate('TradeCenter', { screen: 'TradeCenterHome' });
            }
            return;
          }
          if (!event.defaultPrevented) {
            if (route.name === 'Live') {
              navigation.navigate('Live', { screen: 'LiveDiscovery' });
            } else if (route.name === 'TradeCenter') {
              navigation.navigate('TradeCenter', { screen: 'TradeCenterHome' });
            } else {
              navigation.navigate(route.name, route.params);
            }
          }
        };

        const lblColor = isFocused ? colors.gold : colors.textMuted;
        const labelNode =
          name === 'TradeCenter' ? (
            <View style={styles.tabLabelStack}>
              <Text style={[styles.label, styles.labelStackLine, { color: lblColor }]}>Trade</Text>
              <Text style={[styles.label, styles.labelStackLine, { color: lblColor }]}>Center</Text>
            </View>
          ) : (
            <Text style={[styles.label, { color: lblColor }]}>
              {name === 'Discover' ? 'Discover' : name === 'HQ' ? 'Seller HQ' : name}
            </Text>
          );

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={({ pressed }) => [styles.tabSlot, pressed && styles.pressed]}
          >
            <Ionicons
              name={iconFor(name, isFocused)}
              size={22}
              color={isFocused ? colors.gold : colors.textMuted}
            />
            {labelNode}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(5,5,5,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    overflow: 'visible',
    zIndex: 10,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    gap: 2,
    minHeight: 48,
  },
  label: {
    ...typography.micro,
    fontSize: 10,
    letterSpacing: 0.35,
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
