import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { useNotificationBadge } from '../../hooks/useNotificationBadge';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { SettingsRow } from '../../components/platform/SettingsRow';
import {
  openContactSupport,
  openHelpCenter,
  openMyOrders,
  openNotificationInbox,
  openSupportInbox,
  openVaultComms,
} from '../../navigation/openPlatform';
import { navigateToAuthWelcome } from '../../navigation/rootNavigationRef';
import type { RootStackParamList } from '../../navigation/types';
import { spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signOut, user } = useAuth();
  const { count: notificationCount } = useNotificationBadge(user?.id);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Settings" subtitle="Account, help, and trust" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SettingsRow
          label="Account"
          sub="Profile, email, password, deletion"
          icon="person-outline"
          onPress={() => navigation.navigate('SettingsAccount')}
        />
        <SettingsRow
          label="My orders"
          sub="Tracking, protection, reviews, disputes"
          icon="receipt-outline"
          onPress={() => openMyOrders(navigation)}
        />
        <SettingsRow
          label="Help Center"
          sub="Buying, selling, trades, shipping"
          icon="help-circle-outline"
          onPress={() => openHelpCenter(navigation)}
        />
        <SettingsRow
          label="Contact Support"
          sub="Open a support ticket"
          icon="chatbox-ellipses-outline"
          onPress={() => openContactSupport(undefined, navigation)}
        />
        <SettingsRow
          label="Support Inbox"
          sub="Track ticket status"
          icon="mail-open-outline"
          onPress={() => openSupportInbox(navigation)}
        />
        <SettingsRow
          label="Notifications"
          sub="Follows, trades, reviews, and vault activity"
          icon="notifications-outline"
          badgeCount={notificationCount}
          onPress={() => openNotificationInbox(navigation)}
        />
        <SettingsRow
          label="Vault comms"
          sub="Trade, order, and inquiry lanes"
          icon="shield-outline"
          onPress={() => openVaultComms(navigation)}
        />
        <SettingsRow
          label="Edit profile"
          sub="Avatar, username, display name"
          icon="create-outline"
          onPress={() => navigation.navigate('ProfileEdit')}
        />
        <SettingsRow
          label="Sign out"
          icon="log-out-outline"
          onPress={() => {
            void signOut();
            navigateToAuthWelcome();
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
