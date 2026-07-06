import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { SettingsSectionHeader } from '../../components/settings/SettingsSectionHeader';
import { SettingsRow } from '../../components/platform/SettingsRow';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useBuyerWalletReadiness } from '../../hooks/useBuyerWalletReadiness';
import { useNotificationBadge } from '../../hooks/useNotificationBadge';
import { useSellerSetupState } from '../../hooks/useSellerSetupState';
import { buyerWalletStatusLabel } from '../../lib/buyerWalletReadinessDisplay';
import { areDevToolsEnabled } from '../../lib/devTools';
import { openLegalUrl } from '../../lib/openLegalUrl';
import { performSignOut, signOutSessionOptions } from '../../lib/signOutSession';
import { sellerSetupMenuLabel } from '../../lib/seller-setup-state';
import {
  openContactSupport,
  openHelpCenter,
  openMyOrders,
  openNotificationInbox,
  openFollowersFollowing,
  openUserProfile,
} from '../../navigation/openPlatform';
import { openSellerHQ } from '../../navigation/openSellerHQ';
import { openSellerSetup } from '../../navigation/openSellerSetup';
import {
  alertPushRegistrationResult,
  isPushNotificationsAvailable,
  requestEnablePushNotifications,
} from '../../push/pushRegistrationService';
import type { RootStackParamList } from '../../navigation/types';
import { spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signOut, user, session } = useAuth();
  const { count: notificationCount } = useNotificationBadge(user?.id);
  const setup = useSellerSetupState(session?.access_token, user?.id, Boolean(user?.id));
  const activated = setup.activated;
  const setupPhase = setup.phase === 'loading' ? 'not_started' : setup.phase;
  const setupLabel = sellerSetupMenuLabel(setupPhase);
  const wallet = useBuyerWalletReadiness(session?.access_token, Boolean(session?.access_token));
  const signOutOpts = signOutSessionOptions(user, session);
  const [pushBusy, setPushBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (session?.access_token) void wallet.refresh();
    }, [session?.access_token, wallet.refresh]),
  );

  const walletSub = wallet.loading ? 'Checking wallet…' : buyerWalletStatusLabel(wallet);

  const enablePushNotifications = async () => {
    if (!user?.id || pushBusy) return;
    if (!isPushNotificationsAvailable()) {
      alertPushRegistrationResult({ ok: false, reason: 'Push requires a physical device.' });
      return;
    }
    setPushBusy(true);
    try {
      alertPushRegistrationResult(
        await requestEnablePushNotifications({
          supabaseUserId: user.id,
          accessToken: session?.access_token,
        }),
      );
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Account" subtitle="Profile, selling, and activity" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SettingsSectionHeader title="Account" />
        <SettingsRow
          label="View Profile"
          sub="Your public storefront"
          icon="person-outline"
          onPress={() => {
            if (!user?.id) {
              Alert.alert('Sign in required', 'Sign in to view your public profile.');
              return;
            }
            openUserProfile(user.id, navigation);
          }}
        />
        <SettingsRow
          label="Vault Wallet"
          sub={walletSub}
          icon="wallet-outline"
          onPress={() => navigation.navigate('BuyerWallet')}
        />

        <SettingsSectionHeader title="Selling" />
        {activated ? (
          <>
            <SettingsRow
              label="Seller HQ"
              sub="Return to Studio — seller tools live in the HQ tab bar"
              icon="briefcase-outline"
              onPress={() => {
                navigation.goBack();
                openSellerHQ();
              }}
            />
            <SettingsRow
              label="Sales layaways"
              sub="Reserved items — ship when paid in full"
              icon="time-outline"
              onPress={() => navigation.navigate('SellerLayaways')}
            />
          </>
        ) : (
          <SettingsRow
            label={setupLabel}
            sub="Connect payouts, add shipping, unlock Seller HQ"
            icon="sparkles-outline"
            onPress={() => openSellerSetup()}
          />
        )}

        <SettingsSectionHeader title="Activity" />
        <SettingsRow
          label="Notifications"
          sub="Follows, trades, and vault activity"
          icon="notifications-outline"
          badgeCount={notificationCount}
          onPress={() => openNotificationInbox(navigation)}
        />
        <SettingsRow
          label={pushBusy ? 'Enabling notifications…' : 'Enable push notifications'}
          sub="Sales, messages, offers, and shipping alerts on this device"
          icon="phone-portrait-outline"
          onPress={() => void enablePushNotifications()}
        />
        <SettingsRow
          label="Messages"
          sub="Buyer and seller conversations"
          icon="chatbubbles-outline"
          onPress={() => navigation.navigate('MessagesInbox')}
        />
        <SettingsRow
          label="Orders"
          sub="Purchases you have made"
          icon="bag-outline"
          onPress={() => openMyOrders(navigation)}
        />
        <SettingsRow
          label="Layaways"
          sub="Reserve items with a deposit"
          icon="calendar-outline"
          onPress={() => navigation.navigate('BuyerLayaways')}
        />
        <SettingsRow
          label="Watchlist"
          sub="Saved listings and auctions"
          icon="heart-outline"
          onPress={() => navigation.navigate('Watchlist')}
        />
        <SettingsRow
          label="Followers & Following"
          sub="See who follows you and who you follow"
          icon="people-outline"
          onPress={() => openFollowersFollowing(navigation)}
        />

        <SettingsSectionHeader title="Legal & trust" />
        <SettingsRow
          label="Terms of Service"
          icon="document-text-outline"
          onPress={() => openLegalUrl('terms')}
        />
        <SettingsRow
          label="Privacy Policy"
          icon="shield-outline"
          onPress={() => openLegalUrl('privacy')}
        />
        <SettingsRow
          label="Community Guidelines"
          icon="people-circle-outline"
          onPress={() => navigation.navigate('CommunityGuidelines')}
        />
        <SettingsRow
          label="Reporting & Safety"
          icon="flag-outline"
          onPress={() => navigation.navigate('ReportingSafety')}
        />

        <SettingsSectionHeader title="Settings" />
        <SettingsRow
          label="Settings"
          sub="Email, password, account deletion"
          icon="settings-outline"
          onPress={() => navigation.navigate('SettingsAccount')}
        />
        <SettingsRow
          label="Support"
          sub="Help center and contact"
          icon="help-circle-outline"
          onPress={() => openHelpCenter(navigation)}
        />
        <SettingsRow
          label="Contact Support"
          sub="Open a support ticket"
          icon="chatbox-ellipses-outline"
          onPress={() => openContactSupport(undefined, navigation)}
        />
        {(areDevToolsEnabled() || __DEV__) ? (
          <SettingsRow
            label="QA environment"
            sub="API ref, session, discovery source, hard reset"
            icon="pulse-outline"
            onPress={() => navigation.navigate('QaEnvironmentDiagnostics')}
          />
        ) : null}
        <SettingsRow
          label="Sign out"
          icon="log-out-outline"
          destructive
          onPress={() => {
            void performSignOut(signOut, signOutOpts);
          }}
          chevron={false}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.sm, paddingBottom: spacing.xxxl },
});
