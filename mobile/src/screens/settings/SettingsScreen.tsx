import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { SettingsSectionHeader } from '../../components/settings/SettingsSectionHeader';
import { SettingsRow } from '../../components/platform/SettingsRow';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useNotificationBadge } from '../../hooks/useNotificationBadge';
import { useSellerSetupState } from '../../hooks/useSellerSetupState';
import { areDevToolsEnabled } from '../../lib/devTools';
import { openLegalUrl } from '../../lib/openLegalUrl';
import { performSignOut } from '../../lib/signOutSession';
import { sellerSetupMenuLabel } from '../../lib/seller-setup-state';
import {
  openContactSupport,
  openHelpCenter,
  openMyOrders,
  openNotificationInbox,
  openUserProfile,
} from '../../navigation/openPlatform';
import { openSellerSetup } from '../../navigation/openSellerSetup';
import type { RootStackParamList } from '../../navigation/types';
import { spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signOut, user, session } = useAuth();
  const { count: notificationCount } = useNotificationBadge(user?.id);
  const setup = useSellerSetupState(session?.access_token, Boolean(user?.id));
  const activated = setup.activated;
  const setupPhase = setup.phase === 'loading' ? 'not_started' : setup.phase;
  const setupLabel = sellerSetupMenuLabel(setupPhase);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Account" subtitle="Profile, selling, and activity" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SettingsSectionHeader title="Account" />
        <SettingsRow
          label="View Profile"
          sub="Your public storefront"
          icon="person-outline"
          onPress={() => user?.id && openUserProfile(user.id, navigation)}
        />
        <SettingsRow
          label="My Account"
          sub="Purchases, wallet, messages, seller tools"
          icon="grid-outline"
          onPress={() => navigation.navigate('AccountHub')}
        />

        <SettingsSectionHeader title="Selling" />
        {activated ? (
          <SettingsRow
            label="Seller HQ"
            sub="You are already in Seller HQ on mobile — use the tab bar for Inventory, Events, and Fulfillment"
            icon="briefcase-outline"
            onPress={() => navigation.goBack()}
          />
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
          label="Watchlist"
          sub="Saved listings and auctions"
          icon="heart-outline"
          onPress={() => navigation.navigate('MainTabs', { screen: 'Marketplace' })}
        />
        <SettingsRow
          label="Following"
          sub="Sellers and collectors you follow"
          icon="people-outline"
          onPress={() => user?.id && openUserProfile(user.id, navigation)}
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
            void performSignOut(signOut);
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
