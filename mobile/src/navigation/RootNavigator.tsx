import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateListingDraftProvider } from '../createListing/CreateListingDraftContext';
import { MainTabNavigator } from './MainTabNavigator';
import { CreateListingNavigator } from './CreateListingNavigator';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { AuthLoginScreen } from '../screens/auth/AuthLoginScreen';
import { AuthSignUpScreen } from '../screens/auth/AuthSignUpScreen';
import { ProfileEditScreen } from '../screens/auth/ProfileEditScreen';
import { SellerHostRoomScreen } from '../screens/SellerHostRoomScreen';
import { MessageComposeScreen } from '../screens/messages/MessageComposeScreen';
import { MessageThreadScreen } from '../screens/messages/MessageThreadScreen';
import { MessagesInboxScreen } from '../screens/messages/MessagesInboxScreen';
import { LaunchIntroScreen } from '../screens/onboarding/LaunchIntroScreen';
import { AuthWelcomeScreen } from '../screens/onboarding/AuthWelcomeScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { SettingsAccountScreen } from '../screens/settings/SettingsAccountScreen';
import { ChangeEmailScreen } from '../screens/settings/ChangeEmailScreen';
import { ChangePasswordScreen } from '../screens/settings/ChangePasswordScreen';
import { DeleteAccountScreen } from '../screens/settings/DeleteAccountScreen';
import { HelpCenterScreen } from '../screens/help/HelpCenterScreen';
import { HelpArticleScreen } from '../screens/help/HelpArticleScreen';
import { ContactSupportScreen } from '../screens/support/ContactSupportScreen';
import { SupportInboxScreen } from '../screens/support/SupportInboxScreen';
import { SupportTicketDetailScreen } from '../screens/support/SupportTicketDetailScreen';
import { OpenDisputeScreen } from '../screens/disputes/OpenDisputeScreen';
import { DisputeDetailScreen } from '../screens/disputes/DisputeDetailScreen';
import { UserProfileScreen } from '../screens/profile/UserProfileScreen';
import { WriteReviewScreen } from '../screens/reviews/WriteReviewScreen';
import { NotificationInboxScreen } from '../screens/notifications/NotificationInboxScreen';
import { VaultEventRecapScreen } from '../screens/seller/VaultEventRecapScreen';
import { VaultCommsScreen } from '../screens/messaging/VaultCommsScreen';
import { MarketplaceReviewPromptEffect } from './MarketplaceReviewPromptEffect';
import { PushRegistrationEffect } from './PushRegistrationEffect';
import { BuyerOrdersScreen } from '../screens/orders/BuyerOrdersScreen';
import { BuyerOrderDetailScreen } from '../screens/orders/BuyerOrderDetailScreen';
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
      <MarketplaceReviewPromptEffect />
      <PushRegistrationEffect />
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
            name="SellerHostRoom"
            component={SellerHostRoomScreen}
            options={{ animation: 'slide_from_right', presentation: 'card' }}
          />
          <Stack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="MessagesInbox"
            component={MessagesInboxScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="MessageThread"
            component={MessageThreadScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="MessageCompose"
            component={MessageComposeScreen}
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
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="SettingsAccount" component={SettingsAccountScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HelpCenter" component={HelpCenterScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="HelpArticle" component={HelpArticleScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="ContactSupport" component={ContactSupportScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="SupportInbox" component={SupportInboxScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="SupportTicketDetail" component={SupportTicketDetailScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="OpenDispute" component={OpenDisputeScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="DisputeDetail" component={DisputeDetailScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="WriteReview" component={WriteReviewScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="NotificationInbox" component={NotificationInboxScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="VaultEventRecap" component={VaultEventRecapScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="VaultComms" component={VaultCommsScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="BuyerOrders" component={BuyerOrdersScreen} options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="BuyerOrderDetail" component={BuyerOrderDetailScreen} options={{ animation: 'slide_from_right' }} />
        </Stack.Navigator>
      </CreateListingDraftProvider>
    </NavigationContainer>
  );
}
