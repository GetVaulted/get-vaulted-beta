import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { SettingsRow } from '../../components/platform/SettingsRow';
import { performSignOut } from '../../lib/signOutSession';
import type { RootStackParamList } from '../../navigation/types';
import { spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsAccount'>;

export function SettingsAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Account" subtitle="Manage your collector identity" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <SettingsRow
          label="Edit profile"
          icon="person-outline"
          onPress={() => navigation.navigate('ProfileEdit')}
        />
        <SettingsRow label="Change email" icon="mail-outline" onPress={() => navigation.navigate('ChangeEmail')} />
        <SettingsRow
          label="Change password"
          icon="key-outline"
          onPress={() => navigation.navigate('ChangePassword')}
        />
        <SettingsRow
          label="Sign out"
          icon="log-out-outline"
          destructive
          onPress={() => {
            void performSignOut(signOut);
          }}
          chevron={false}
        />
        <SettingsRow
          label="Delete account"
          sub="Permanent — cannot be undone"
          icon="trash-outline"
          destructive
          onPress={() => navigation.navigate('DeleteAccount')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.sm, paddingBottom: spacing.xxxl },
});
