import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MarketplaceScreen } from '../screens/MarketplaceScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SellerHubScreen } from '../screens/SellerHubScreen';
import { TradeCenterStackNavigator } from './TradeCenterStackNavigator';
import type { MainTabParamList } from './types';
import { LiveStackNavigator } from './LiveStackNavigator';
import { VaultTabBar } from './VaultTabBar';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <VaultTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: false,
        // Transparent so LiveActiveSessionSurface (sibling under App) paints through Live.
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Marketplace" component={MarketplaceScreen} options={{ tabBarAccessibilityLabel: 'Marketplace' }} />
      <Tab.Screen name="Live" component={LiveStackNavigator} />
      <Tab.Screen
        name="TradeCenter"
        component={TradeCenterStackNavigator}
        options={{ tabBarAccessibilityLabel: 'Trade Center' }}
      />
      <Tab.Screen
        name="HQ"
        component={SellerHubScreen}
        options={{ tabBarAccessibilityLabel: 'Seller HQ — seller console and payouts' }}
      />
    </Tab.Navigator>
  );
}
