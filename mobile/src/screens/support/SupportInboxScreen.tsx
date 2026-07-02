import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { fetchMySupportTickets } from '../../api/supportRepository';
import type { SupportTicket } from '../../platform/types';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportInbox'>;

export function SupportInboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || !session?.access_token) return;
    setLoading(true);
    try {
      setTickets(await fetchMySupportTickets(session.access_token));
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Support Inbox" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : tickets.length ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {tickets.map((t) => (
            <Pressable
              key={t.id}
              style={styles.row}
              onPress={() => navigation.navigate('SupportTicketDetail', { ticketId: t.id })}
            >
              <Text style={styles.title} numberOfLines={1}>
                {t.subject}
              </Text>
              <Text style={styles.meta}>
                {t.status.replace('_', ' ')} · {new Date(t.createdAt).toLocaleDateString()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>No support tickets yet.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  row: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: 4,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted },
  empty: { color: colors.textMuted, fontSize: 14, marginTop: spacing.xl },
});
