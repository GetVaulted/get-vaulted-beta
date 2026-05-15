import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateListingDraftProvider } from '../createListing/CreateListingDraftContext';
import { MainTabNavigator } from './MainTabNavigator';
import { CreateListingNavigator } from './CreateListingNavigator';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { AuthLoginScreen } from '../screens/auth/AuthLoginScreen';
import { AuthSignUpScreen } from '../screens/auth/AuthSignUpScreen';
import { ProfileEditScreen } from '../screens/auth/ProfileEditScreen';
import { LaunchIntroScreen } from '../screens/onboarding/LaunchIntroScreen';
import { AuthWelcomeScreen } from '../screens/onboarding/AuthWelcomeScreen';
import type { RootStackParamList } from './types';
import { colors } from '../theme';
import { rootNavigationRef } from './rootNavigationRef';
import { AuthSessionRoutingEffect } from './AuthSessionRoutingEffect';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.gold,
    text: colors.textPrimary,
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer ref={rootNavigationRef} theme={theme}>
      <AuthSessionRoutingEffect />
      <CreateListingDraftProvider>
        <Stack.Navigator
          initialRouteName="LaunchIntro"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen
            name="LaunchIntro"
            component={LaunchIntroScreen}
            options={{ animation: 'none', gestureEnabled: false }}
          />
          <Stack.Screen name="AuthWelcome" component={AuthWelcomeScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="MainTabs" component={MainTabNavigator} options={{ animation: 'fade' }} />
          <Stack.Screen
            name="AuthLogin"
            component={AuthLoginScreen}
            options={{ animation: 'slide_from_right', presentation: 'card' }}
          />
          <Stack.Screen
            name="AuthSignUp"
            component={AuthSignUpScreen}
            options={{ animation: 'slide_from_right', presentation: 'card' }}
          />
          <Stack.Screen name="ProfileEdit" component={ProfileEditScreen} />
          <Stack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="CreateListingFlow"
            component={CreateListingNavigator}
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack.Navigator>
      </CreateListingDraftProvider>
    </NavigationContainer>
  );
}
