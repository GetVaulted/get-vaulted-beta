import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteAccountApi,
  fetchAccountDeletionBlockers,
  type AccountDeletionBlocker,
} from '../../api/accountRepository';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { performSignOut, signOutSessionOptions } from '../../lib/signOutSession';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

const CONFIRM = 'DELETE';

type Props = NativeStackScreenProps<RootStackParamList, 'DeleteAccount'>;

export function DeleteAccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session, signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const [blockers, setBlockers] = useState<AccountDeletionBlocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadBlockers = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;
    setLoading(true);
    try {
      const list = await fetchAccountDeletionBlockers(token);
      setBlockers(list);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadBlockers();
  }, [loadBlockers]);

  const canDelete = typed === CONFIRM && blockers.length === 0 && !busy && Boolean(session?.access_token);

  const submit = async () => {
    const token = session?.access_token;
    if (!token || !canDelete) return;
    Alert.alert(
      'Delete account permanently?',
      'Your profile will be anonymized and you will be signed out. Financial records may be retained where required. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const result = await deleteAccountApi(token);
                if (!result.ok) {
                  Alert.alert('Could not delete', result.error);
                  await loadBlockers();
                  return;
                }
                await performSignOut(signOut, signOutSessionOptions(user, session));
              } catch (e) {
                Alert.alert('Could not delete', e instanceof Error ? e.message : 'Unknown error');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Delete account" subtitle="Permanent action" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.warn}>
          Deleting your account anonymizes your profile, revokes sign-in, and disconnects seller payout settings.
          Open orders, live shows, or pending payouts must be cleared first. Financial records may be retained where
          legally required.
        </Text>
        {loading ? <ActivityIndicator color={colors.gold} /> : null}
        {blockers.map((b) => (
          <View key={b.code} style={styles.blocker}>
            <Text style={styles.blockerTxt}>{b.message}</Text>
          </View>
        ))}
        <Text style={styles.label}>Type {CONFIRM} to confirm</Text>
        <TextInput
          style={styles.input}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={CONFIRM}
          placeholderTextColor={colors.textMuted}
        />
        <Pressable
          style={[styles.btn, !canDelete && styles.btnOff]}
          disabled={!canDelete}
          onPress={() => void submit()}
        >
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.btnTxt}>Delete my account</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.md, paddingBottom: spacing.xxxl },
  warn: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  blocker: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.25)',
  },
  blockerTxt: { color: colors.live, fontSize: 13, lineHeight: 18 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
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
    backgroundColor: colors.live,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnOff: { opacity: 0.4 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
