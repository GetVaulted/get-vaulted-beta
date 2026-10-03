import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { getSupabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangeEmail'>;

export function ChangeEmailScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next = email.trim();
    if (!next.includes('@')) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      Alert.alert('Unavailable', 'Connect your vault to update email.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ email: next });
      if (error) throw error;
      Alert.alert('Check your inbox', 'We sent a confirmation link to your new email address.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not update email', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Change email" onBack={() => navigation.goBack()} />
      <Text style={styles.hint}>A confirmation link will be sent to verify your new address.</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="you@example.com"
        placeholderTextColor={colors.textMuted}
      />
      <Pressable style={[styles.btn, busy && styles.btnOff]} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.btnTxt}>Update email</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  hint: { color: colors.textSecondary, fontSize: 14, marginBottom: spacing.md, lineHeight: 20 },
  input: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
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
