import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LiveDiscoveryScreen } from '../screens/LiveDiscoveryScreen';
import { LiveRoomScreen } from '../screens/LiveRoomScreen';
import type { LiveStackParamList } from './types';

const Stack = createNativeStackNavigator<LiveStackParamList>();

export function LiveStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Transparent so LiveActiveSessionSurface (sibling under App) paints through.
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="LiveDiscovery" component={LiveDiscoveryScreen} />
      <Stack.Screen
        name="LiveRoom"
        component={LiveRoomScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack.Navigator>
  );
}
