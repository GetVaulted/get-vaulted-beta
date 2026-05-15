import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BrowseScreen } from '../screens/BrowseScreen';
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
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Discover" component={BrowseScreen} options={{ tabBarAccessibilityLabel: 'Discover' }} />
      <Tab.Screen name="Live" component={LiveStackNavigator} />
      <Tab.Screen
        name="TradeCenter"
        component={TradeCenterStackNavigator}
        options={{ tabBarAccessibilityLabel: 'Trade Center' }}
      />
      <Tab.Screen name="HQ" component={SellerHubScreen} options={{ tabBarAccessibilityLabel: 'HQ' }} />
    </Tab.Navigator>
  );
}
