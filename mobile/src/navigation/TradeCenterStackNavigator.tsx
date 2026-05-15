import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { TradeCenterStackParamList } from './types';
import { colors } from '../theme';
import { TradeCenterHomeScreen } from '../screens/trade/TradeCenterHomeScreen';
import { InitiateTradeScreen } from '../screens/trade/InitiateTradeScreen';
import { ReviewOfferScreen } from '../screens/trade/ReviewOfferScreen';
import { CounterOfferScreen } from '../screens/trade/CounterOfferScreen';
import { TradeCheckoutScreen } from '../screens/trade/TradeCheckoutScreen';
import { TradeDetailScreen } from '../screens/trade/TradeDetailScreen';
import { TradeCenterQaToolsScreen } from '../screens/trade/TradeCenterQaToolsScreen';
import { TradeCenterDiagnosticsProvider } from '../trade/TradeCenterDiagnosticsContext';

const Stack = createNativeStackNavigator<TradeCenterStackParamList>();

export function TradeCenterStackNavigator() {
  return (
    <TradeCenterDiagnosticsProvider>
      <Stack.Navigator
        initialRouteName="TradeCenterHome"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="TradeCenterHome" component={TradeCenterHomeScreen} options={{ animation: 'none' }} />
        <Stack.Screen name="InitiateTrade" component={InitiateTradeScreen} />
        <Stack.Screen name="ReviewOffer" component={ReviewOfferScreen} />
        <Stack.Screen name="CounterOffer" component={CounterOfferScreen} />
        <Stack.Screen name="TradeCheckout" component={TradeCheckoutScreen} />
        <Stack.Screen name="TradeDetail" component={TradeDetailScreen} />
        <Stack.Screen name="TradeCenterQa" component={TradeCenterQaToolsScreen} />
      </Stack.Navigator>
    </TradeCenterDiagnosticsProvider>
  );
}
