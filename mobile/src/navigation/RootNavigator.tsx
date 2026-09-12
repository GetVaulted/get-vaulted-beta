import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { CreateListingDraftProvider } from '../createListing/CreateListingDraftContext';
import { MainTabNavigator } from './MainTabNavigator';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { AuthLoginScreen } from '../screens/auth/AuthLoginScreen';
import { AuthSignUpScreen } from '../screens/auth/AuthSignUpScreen';
import { CompleteProfileSetupScreen } from '../screens/auth/CompleteProfileSetupScreen';
import { NotificationPermissionScreen } from '../screens/auth/NotificationPermissionScreen';
import { ProfileEditScreen } from '../screens/auth/ProfileEditScreen';
import { LaunchIntroScreen } from '../screens/onboarding/LaunchIntroScreen';
import { AuthWelcomeScreen } from '../screens/onboarding/AuthWelcomeScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { QaEnvironmentDiagnosticsScreen } from '../screens/settings/QaEnvironmentDiagnosticsScreen';
import { SettingsAccountScreen } from '../screens/settings/SettingsAccountScreen';
import { ChangeEmailScreen } from '../screens/settings/ChangeEmailScreen';
import { ChangePasswordScreen } from '../screens/settings/ChangePasswordScreen';
import { TwoFactorAuthScreen } from '../screens/settings/TwoFactorAuthScreen';
import { DeleteAccountScreen } from '../screens/settings/DeleteAccountScreen';
import { CommunityGuidelinesScreen } from '../screens/settings/CommunityGuidelinesScreen';
import { ReportingSafetyScreen } from '../screens/settings/ReportingSafetyScreen';
import { BlockedUsersScreen } from '../screens/settings/BlockedUsersScreen';
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
import { MarketplaceCatalogSyncEffect } from './MarketplaceCatalogSyncEffect';
import { NotificationDeepLinkEffect } from './NotificationDeepLinkEffect';
import { ReviewPromptGate } from '../components/reviews/ReviewPromptGate';
import { reviewPromptGateRef } from '../lib/reviewPromptGateRef';
import { MfaChallengeGate } from '../components/security/MfaChallengeGate';
import { lazyScreen } from './lazyScreen';
import type { RootStackParamList } from './types';
import { colors } from '../theme';
import { rootNavigationRef } from './rootNavigationRef';
import { AuthSessionRoutingEffect } from './AuthSessionRoutingEffect';
import { ProfileSetupRoutingEffect } from './ProfileSetupRoutingEffect';
import { AppPresenceHeartbeatEffect } from './AppPresenceHeartbeatEffect';
import { AccountSwitchEffect } from './AccountSwitchEffect';
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
const MessageNewScreen = lazyScreen(
  () => import('../screens/messages/MessageNewScreen'),
  (m) => m.MessageNewScreen,
);
const UserProfileScreen = lazyScreen(
  () => import('../screens/profile/UserProfileScreen'),
  (m) => m.UserProfileScreen,
);
const SellerShopScreen = lazyScreen(
  () => import('../screens/profile/SellerShopScreen'),
  (m) => m.SellerShopScreen,
);
const SellerProfileByUsernameScreen = lazyScreen(
  () => import('../screens/profile/SellerProfileByUsernameScreen'),
  (m) => m.SellerProfileByUsernameScreen,
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
const WatchlistScreen = lazyScreen(
  () => import('../screens/account/WatchlistScreen'),
  (m) => m.WatchlistScreen,
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
const BuyerWalletScreen = lazyScreen(
  () => import('../screens/account/BuyerWalletScreen'),
  (m) => m.BuyerWalletScreen,
);
const PromoEntryScreen = lazyScreen(
  () => import('../screens/promo/PromoEntryScreen'),
  (m) => m.PromoEntryScreen,
);
const AdminOpsHomeScreen = lazyScreen(
  () => import('../screens/admin/AdminOpsHomeScreen'),
  (m) => m.AdminOpsHomeScreen,
);
const AdminLiveShowsScreen = lazyScreen(
  () => import('../screens/admin/AdminLiveShowsScreen'),
  (m) => m.AdminLiveShowsScreen,
);
const AdminSupportTicketsScreen = lazyScreen(
  () => import('../screens/admin/AdminSupportTicketsScreen'),
  (m) => m.AdminSupportTicketsScreen,
);
const AdminSupportTicketDetailScreen = lazyScreen(
  () => import('../screens/admin/AdminSupportTicketDetailScreen'),
  (m) => m.AdminSupportTicketDetailScreen,
);
const AdminTrustScreen = lazyScreen(
  () => import('../screens/admin/AdminTrustScreen'),
  (m) => m.AdminTrustScreen,
);
const AdminReportDetailScreen = lazyScreen(
  () => import('../screens/admin/AdminReportDetailScreen'),
  (m) => m.AdminReportDetailScreen,
);
const AdminFulfillmentScreen = lazyScreen(
  () => import('../screens/admin/AdminFulfillmentScreen'),
  (m) => m.AdminFulfillmentScreen,
);
const AdminOrderDetailScreen = lazyScreen(
  () => import('../screens/admin/AdminOrderDetailScreen'),
  (m) => m.AdminOrderDetailScreen,
);
const AdminModerationScreen = lazyScreen(
  () => import('../screens/admin/AdminModerationScreen'),
  (m) => m.AdminModerationScreen,
);
const AdminUsersScreen = lazyScreen(
  () => import('../screens/admin/AdminUsersScreen'),
  (m) => m.AdminUsersScreen,
);
const AdminNotificationsScreen = lazyScreen(
  () => import('../screens/admin/AdminNotificationsScreen'),
  (m) => m.AdminNotificationsScreen,
);
const AdminSellerRiskScreen = lazyScreen(
  () => import('../screens/admin/AdminSellerRiskScreen'),
  (m) => m.AdminSellerRiskScreen,
);
const AdminHealthScreen = lazyScreen(
  () => import('../screens/admin/AdminHealthScreen'),
  (m) => m.AdminHealthScreen,
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
      <View style={rootStyles.root}>
        <AuthSessionRoutingEffect />
        <ProfileSetupRoutingEffect />
        <AppPresenceHeartbeatEffect />
        <AccountSwitchEffect />
        <MarketplaceReviewPromptEffect />
        <PushRegistrationEffect />
        <MarketplaceCatalogSyncEffect />
        <NotificationDeepLinkEffect />
        <ReviewPromptGate ref={reviewPromptGateRef} />
        <MfaChallengeGate />
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
          <Stack.Screen
            name="CompleteProfileSetup"
            component={CompleteProfileSetupScreen}
            options={{ animation: 'fade', gestureEnabled: false }}
          />
          <Stack.Screen
            name="NotificationPermission"
            component={NotificationPermissionScreen}
            options={{ animation: 'fade', gestureEnabled: false }}
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
            name="MessageNew"
            component={MessageNewScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
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
          <Stack.Screen name="Settings" component={SettingsScreen} />
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
          <Stack.Screen name="TwoFactorAuth" component={TwoFactorAuthScreen} />
          <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
          <Stack.Screen name="CommunityGuidelines" component={CommunityGuidelinesScreen} />
          <Stack.Screen name="ReportingSafety" component={ReportingSafetyScreen} />
          <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
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
          <Stack.Screen name="SellerShop" component={SellerShopScreen} />
          <Stack.Screen name="SellerProfileByUsername" component={SellerProfileByUsernameScreen} />
          <Stack.Screen name="FollowersFollowing" component={FollowersFollowingScreen} />
          <Stack.Screen name="WriteReview" component={WriteReviewScreen} />
          <Stack.Screen name="NotificationInbox" component={NotificationInboxScreen} />
          <Stack.Screen name="VaultEventRecap" component={VaultEventRecapScreen} />
          <Stack.Screen name="VaultComms" component={VaultCommsScreen} />
          <Stack.Screen name="BuyerOrders" component={BuyerOrdersScreen} />
          <Stack.Screen name="BuyerOrderDetail" component={BuyerOrderDetailScreen} />
          <Stack.Screen name="BuyerLayaways" component={BuyerLayawaysScreen} />
          <Stack.Screen name="Watchlist" component={WatchlistScreen} />
          <Stack.Screen name="SellerLayaways" component={SellerLayawaysScreen} />
          <Stack.Screen name="SellerLayawayDetail" component={SellerLayawayDetailScreen} />
          <Stack.Screen name="SellerOrderDetail" component={SellerOrderDetailScreen} />
          <Stack.Screen
            name="PromoEntry"
            component={PromoEntryScreen}
            options={{ animation: 'slide_from_right', presentation: 'card' }}
          />
          <Stack.Screen name="AdminOpsHome" component={AdminOpsHomeScreen} />
          <Stack.Screen name="AdminLiveShows" component={AdminLiveShowsScreen} />
          <Stack.Screen name="AdminSupportTickets" component={AdminSupportTicketsScreen} />
          <Stack.Screen name="AdminSupportTicketDetail" component={AdminSupportTicketDetailScreen} />
          <Stack.Screen name="AdminTrust" component={AdminTrustScreen} />
          <Stack.Screen name="AdminReportDetail" component={AdminReportDetailScreen} />
          <Stack.Screen name="AdminFulfillment" component={AdminFulfillmentScreen} />
          <Stack.Screen name="AdminOrderDetail" component={AdminOrderDetailScreen} />
          <Stack.Screen name="AdminModeration" component={AdminModerationScreen} />
          <Stack.Screen name="AdminUsers" component={AdminUsersScreen} />
          <Stack.Screen name="AdminNotifications" component={AdminNotificationsScreen} />
          <Stack.Screen name="AdminSellerRisk" component={AdminSellerRiskScreen} />
          <Stack.Screen name="AdminHealth" component={AdminHealthScreen} />
        </Stack.Navigator>
        </CreateListingDraftProvider>
      </View>
    </NavigationContainer>
  );
}

const rootStyles = StyleSheet.create({
  root: { flex: 1 },
});
