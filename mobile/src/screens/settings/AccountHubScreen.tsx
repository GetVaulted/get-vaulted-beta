import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { SettingsSectionHeader } from '../../components/settings/SettingsSectionHeader';
import { SettingsRow } from '../../components/platform/SettingsRow';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { useNotificationBadge } from '../../hooks/useNotificationBadge';
import { useSellerSetupState } from '../../hooks/useSellerSetupState';
import { sellerSetupMenuLabel } from '../../lib/seller-setup-state';
import {
  openContactSupport,
  openHelpCenter,
  openMyOrders,
  openNotificationInbox,
  openUserProfile,
} from '../../navigation/openPlatform';
import { openSellerHQ } from '../../navigation/openSellerHQ';
import { openSellerSetup } from '../../navigation/openSellerSetup';
import type { RootStackParamList } from '../../navigation/types';
import { spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountHub'>;

export function AccountHubScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const { count: notificationCount } = useNotificationBadge(user?.id);
  const setup = useSellerSetupState(session?.access_token, Boolean(user?.id));
  const activated = setup.activated;
  const setupLabel = sellerSetupMenuLabel(setup.phase === 'loading' ? 'not_started' : setup.phase);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="My Account"
        subtitle="Purchases, wallet, messages, and seller tools"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SettingsSectionHeader title="Account" />
        <SettingsRow
          label="View Profile"
          sub="Your public storefront"
          icon="person-outline"
          onPress={() => user?.id && openUserProfile(user.id, navigation)}
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
          onPress={() => navigation.navigate('MainTabs', { screen: 'Marketplace' })}
        />
        <SettingsRow
          label="Following"
          sub="Sellers and collectors you follow"
          icon="people-outline"
          onPress={() => user?.id && openUserProfile(user.id, navigation)}
        />

        <SettingsSectionHeader title="Settings" />
        <SettingsRow
          label="Account settings"
          sub="Email, password, deletion"
          icon="settings-outline"
          onPress={() => navigation.navigate('SettingsAccount')}
        />
        <SettingsRow
          label="Support"
          sub="Help center and contact"
          icon="help-circle-outline"
          onPress={() => openHelpCenter(navigation)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.sm, paddingBottom: spacing.xxxl },
});
