import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchAdminBroadcasts,
  postAdminBroadcast,
  type AdminBroadcast,
} from '../../api/adminOpsApi';
import {
  AdminActionButton,
  AdminEmpty,
  AdminListRow,
  AdminScreenShell,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminNotifications'>;

export function AdminNotificationsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [href, setHref] = useState('');
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (quiet?: boolean) => {
      if (!token) {
        setError('Sign in required.');
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const data = await fetchAdminBroadcasts(token);
        setBroadcasts(data.broadcasts);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const send = () => {
    if (!token) return;
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      Alert.alert('Missing fields', 'Title and message are required.');
      return;
    }
    Alert.alert('Send to everyone?', `${t}\n\n${b}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send push',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              const res = await postAdminBroadcast(token, {
                title: t,
                body: b,
                href: href.trim() || null,
              });
              Alert.alert(
                'Sent',
                `${res.recipientCount} recipients · ${res.pushSentCount} pushes`,
              );
              setTitle('');
              setBody('');
              setHref('');
              await load(true);
            } catch (e) {
              Alert.alert('Send failed', e instanceof Error ? e.message : 'Try again');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <AdminScreenShell
      title="Mass notifications"
      subtitle="Push to all non-suspended users"
      onBack={() => navigation.goBack()}
      loading={loading && broadcasts.length === 0}
      error={error && broadcasts.length === 0 ? error : null}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
    >
      <Text style={styles.label}>Title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Notification title"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        maxLength={200}
      />
      <Text style={styles.label}>Message</Text>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Push body"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, styles.multiline]}
        multiline
        maxLength={500}
      />
      <Text style={styles.label}>Link (optional)</Text>
      <TextInput
        value={href}
        onChangeText={setHref}
        placeholder="/live or https://…"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoCapitalize="none"
      />
      <AdminActionButton label={busy ? 'Sending…' : 'Send to everyone'} disabled={busy} onPress={send} />

      <Text style={[styles.label, { marginTop: spacing.md }]}>Recent broadcasts</Text>
      {broadcasts.length === 0 ? (
        <AdminEmpty message="No broadcasts yet." />
      ) : (
        broadcasts.map((b) => (
          <AdminListRow
            key={b.id}
            title={b.title}
            meta={`${b.body} · ${b.pushSentCount}/${b.recipientCount} · ${new Date(b.createdAt).toLocaleString()}`}
          />
        ))
      )}
    </AdminScreenShell>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 15,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
});
