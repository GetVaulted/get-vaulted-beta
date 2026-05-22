import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { AuthPasswordField } from '../../components/auth/AuthPasswordField';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { getSupabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePassword'>;

export function ChangePasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 8) {
      Alert.alert('Weak password', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      Alert.alert('Unavailable', 'Connect your vault to update password.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert('Password updated', 'Use your new password next time you sign in.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not update password', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Change password" onBack={() => navigation.goBack()} />
      <AuthPasswordField
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
        visible={passwordVisible}
        onToggleVisible={() => setPasswordVisible((v) => !v)}
        autoComplete="new-password"
      />
      <AuthPasswordField
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirm password"
        visible={confirmVisible}
        onToggleVisible={() => setConfirmVisible((v) => !v)}
        autoComplete="new-password"
        containerStyle={{ marginTop: spacing.sm }}
      />
      <Pressable style={[styles.btn, busy && styles.btnOff]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.btnTxt}>Update password</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnOff: { opacity: 0.6 },
  btnTxt: { color: colors.background, fontWeight: '800', fontSize: 15 },
});
