import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CreateListingDraftProvider } from '../createListing/CreateListingDraftContext';
import { MainTabNavigator } from './MainTabNavigator';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { AuthLoginScreen } from '../screens/auth/AuthLoginScreen';
import { AuthSignUpScreen } from '../screens/auth/AuthSignUpScreen';
import { ProfileEditScreen } from '../screens/auth/ProfileEditScreen';
import { LaunchIntroScreen } from '../screens/onboarding/LaunchIntroScreen';
import { AuthWelcomeScreen } from '../screens/onboarding/AuthWelcomeScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { QaEnvironmentDiagnosticsScreen } from '../screens/settings/QaEnvironmentDiagnosticsScreen';
import { SettingsAccountScreen } from '../screens/settings/SettingsAccountScreen';
import { ChangeEmailScreen } from '../screens/settings/ChangeEmailScreen';
import { ChangePasswordScreen } from '../screens/settings/ChangePasswordScreen';
import { DeleteAccountScreen } from '../screens/settings/DeleteAccountScreen';
import { CommunityGuidelinesScreen } from '../screens/settings/CommunityGuidelinesScreen';
import { ReportingSafetyScreen } from '../screens/settings/ReportingSafetyScreen';
import { HelpCenterScreen } from '../screens/help/HelpCenterScreen';
import { VaultSearchScreen } from '../screens/VaultSearchScreen';
import { HelpArticleScreen } from '../screens/help/HelpArticleScreen';
import { ContactSupportScreen } from '../screens/support/ContactSupportScreen';
import { SupportInboxScreen } from '../screens/support/SupportInboxScreen';
import { SupportTicketDetailScreen } from '../screens/support/SupportTicketDetailScreen';
import { OpenDisputeScreen } from '../screens/disputes/OpenDisputeScreen';
import { DisputeDetailScreen } from '../screens/disputes/DisputeDetailScreen';
import { NotificationInboxScreen } from '../screens/notifications/NotificationInboxScreen';
import { MarketplaceReviewPromptEffect } from './MarketplaceReviewPromptEffect';
import { PushRegistrationEffect } from './PushRegistrationEffect';
import { NotificationDeepLinkEffect } from './NotificationDeepLinkEffect';
import { lazyScreen } from './lazyScreen';
import type { RootStackParamList } from './types';
import { colors } from '../theme';
import { rootNavigationRef } from './rootNavigationRef';
import { AuthSessionRoutingEffect } from './AuthSessionRoutingEffect';
import { navigationLinking } from './linkingConfig';

const Stack = createNativeStackNavigator<RootStackParamList>();

const SellerHostRoomScreen = lazyScreen(
  () => import('../screens/SellerHostRoomScreen'),
  (m) => m.SellerHostRoomScreen,
);
const CreateListingNavigator = lazyScreen(
  () => import('./CreateListingNavigator'),
  (m) => m.CreateListingNavigator,
);
const MessagesInboxScreen = lazyScreen(
  () => import('../screens/messages/MessagesInboxScreen'),
  (m) => m.MessagesInboxScreen,
);
const MessageThreadScreen = lazyScreen(
  () => import('../screens/messages/MessageThreadScreen'),
  (m) => m.MessageThreadScreen,
);
const MessageComposeScreen = lazyScreen(
  () => import('../screens/messages/MessageComposeScreen'),
  (m) => m.MessageComposeScreen,
);
const UserProfileScreen = lazyScreen(
  () => import('../screens/profile/UserProfileScreen'),
  (m) => m.UserProfileScreen,
);
const FollowersFollowingScreen = lazyScreen(
  () => import('../screens/profile/FollowersFollowingScreen'),
  (m) => m.FollowersFollowingScreen,
);
const WriteReviewScreen = lazyScreen(
  () => import('../screens/reviews/WriteReviewScreen'),
  (m) => m.WriteReviewScreen,
);
const VaultEventRecapScreen = lazyScreen(
  () => import('../screens/seller/VaultEventRecapScreen'),
  (m) => m.VaultEventRecapScreen,
);
const VaultCommsScreen = lazyScreen(
  () => import('../screens/messaging/VaultCommsScreen'),
  (m) => m.VaultCommsScreen,
);
const BuyerOrdersScreen = lazyScreen(
  () => import('../screens/orders/BuyerOrdersScreen'),
  (m) => m.BuyerOrdersScreen,
);
const BuyerOrderDetailScreen = lazyScreen(
  () => import('../screens/orders/BuyerOrderDetailScreen'),
  (m) => m.BuyerOrderDetailScreen,
);
const BuyerLayawaysScreen = lazyScreen(
  () => import('../screens/account/BuyerLayawaysScreen'),
  (m) => m.BuyerLayawaysScreen,
);
const MarketplaceCheckoutScreen = lazyScreen(
  () => import('../screens/marketplace/MarketplaceCheckoutScreen'),
  (m) => m.MarketplaceCheckoutScreen,
);
const SellerLayawaysScreen = lazyScreen(
  () => import('../screens/seller/SellerLayawaysScreen'),
  (m) => m.SellerLayawaysScreen,
);
const SellerLayawayDetailScreen = lazyScreen(
  () => import('../screens/seller/SellerLayawayDetailScreen'),
  (m) => m.SellerLayawayDetailScreen,
);
const SellerOrderDetailScreen = lazyScreen(
  () => import('../screens/seller/SellerOrderDetailScreen'),
  (m) => m.SellerOrderDetailScreen,
);
const SellerListingManagementScreen = lazyScreen(
  () => import('../screens/seller/SellerListingManagementScreen'),
  (m) => m.SellerListingManagementScreen,
);
const SellerSetupWizardScreen = lazyScreen(
  () => import('../screens/sellerSetup/SellerSetupWizardScreen'),
  (m) => m.SellerSetupWizardScreen,
);
const AccountHubScreen = lazyScreen(
  () => import('../screens/settings/AccountHubScreen'),
  (m) => m.AccountHubScreen,
);
const BuyerWalletScreen = lazyScreen(
  () => import('../screens/account/BuyerWalletScreen'),
  (m) => m.BuyerWalletScreen,
);
const PromoEntryScreen = lazyScreen(
  () => import('../screens/promo/PromoEntryScreen'),
  (m) => m.PromoEntryScreen,
);

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

const stackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.background },
  animation: 'slide_from_right' as const,
  animationDuration: 280,
  freezeOnBlur: true,
};

export function RootNavigator() {
  return (
    <NavigationContainer ref={rootNavigationRef} theme={theme} linking={navigationLinking}>
      <AuthSessionRoutingEffect />
      <MarketplaceReviewPromptEffect />
      <PushRegistrationEffect />
      <NotificationDeepLinkEffect />
      <CreateListingDraftProvider>
        <Stack.Navigator initialRouteName="LaunchIntro" screenOptions={stackScreenOptions}>
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
            options={{ animation: 'slide_from_right', presentation: 'card', gestureEnabled: false }}
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
            name="MarketplaceCheckout"
            component={MarketplaceCheckoutScreen}
            options={{
              presentation: 'card',
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="SellerListingManagement"
            component={SellerListingManagementScreen}
            options={{ animation: 'slide_from_right', presentation: 'card' }}
          />
          <Stack.Screen name="MessagesInbox" component={MessagesInboxScreen} />
          <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
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
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="AccountHub" component={AccountHubScreen} />
          <Stack.Screen name="BuyerWallet" component={BuyerWalletScreen} />
          <Stack.Screen
            name="SellerSetupWizard"
            component={SellerSetupWizardScreen}
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen name="QaEnvironmentDiagnostics" component={QaEnvironmentDiagnosticsScreen} />
          <Stack.Screen name="SettingsAccount" component={SettingsAccountScreen} />
          <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
          <Stack.Screen name="CommunityGuidelines" component={CommunityGuidelinesScreen} />
          <Stack.Screen name="ReportingSafety" component={ReportingSafetyScreen} />
          <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
          <Stack.Screen
            name="VaultSearch"
            component={VaultSearchScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen name="HelpArticle" component={HelpArticleScreen} />
          <Stack.Screen name="ContactSupport" component={ContactSupportScreen} />
          <Stack.Screen name="SupportInbox" component={SupportInboxScreen} />
          <Stack.Screen name="SupportTicketDetail" component={SupportTicketDetailScreen} />
          <Stack.Screen name="OpenDispute" component={OpenDisputeScreen} />
          <Stack.Screen name="DisputeDetail" component={DisputeDetailScreen} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          <Stack.Screen name="FollowersFollowing" component={FollowersFollowingScreen} />
          <Stack.Screen name="WriteReview" component={WriteReviewScreen} />
          <Stack.Screen name="NotificationInbox" component={NotificationInboxScreen} />
          <Stack.Screen name="VaultEventRecap" component={VaultEventRecapScreen} />
          <Stack.Screen name="VaultComms" component={VaultCommsScreen} />
          <Stack.Screen name="BuyerOrders" component={BuyerOrdersScreen} />
          <Stack.Screen name="BuyerOrderDetail" component={BuyerOrderDetailScreen} />
          <Stack.Screen name="BuyerLayaways" component={BuyerLayawaysScreen} />
          <Stack.Screen name="SellerLayaways" component={SellerLayawaysScreen} />
          <Stack.Screen name="SellerLayawayDetail" component={SellerLayawayDetailScreen} />
          <Stack.Screen name="SellerOrderDetail" component={SellerOrderDetailScreen} />
          <Stack.Screen
            name="PromoEntry"
            component={PromoEntryScreen}
            options={{ animation: 'slide_from_right', presentation: 'card' }}
          />
        </Stack.Navigator>
      </CreateListingDraftProvider>
    </NavigationContainer>
  );
}
