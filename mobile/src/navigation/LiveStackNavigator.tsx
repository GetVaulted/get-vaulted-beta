import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LiveDiscoveryScreen } from '../screens/LiveDiscoveryScreen';
import { LiveRoomScreen } from '../screens/LiveRoomScreen';
import type { LiveStackParamList } from './types';
import { colors } from '../theme';

const Stack = createNativeStackNavigator<LiveStackParamList>();

export function LiveStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="LiveDiscovery" component={LiveDiscoveryScreen} />
      <Stack.Screen name="LiveRoom" component={LiveRoomScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}
