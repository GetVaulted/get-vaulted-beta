import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMessageThreads } from '../../api/messagesRepository';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { VAULT_THREAD_FILTERS, vaultKindFromConversation, vaultKindLabel } from '../../messaging/vaultThreadMapping';
import type { VaultThreadKind } from '../../messaging/vaultMessagingTypes';
import type { RootStackParamList } from '../../navigation/types';
import type { ThreadListItem } from '../../types/messages';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VaultComms'>;

export function VaultCommsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<VaultThreadKind | 'all'>('all');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const { threads: rows } = await fetchMessageThreads(session.access_token, 'primary');
      setThreads(rows);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return threads;
    return threads.filter((t) => vaultKindFromConversation(t.conversationKind) === filter);
  }, [filter, threads]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="Vault comms"
        subtitle="Protected lanes — not social chat"
        onBack={() => navigation.goBack()}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {VAULT_THREAD_FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[styles.chip, filter === f.id && styles.chipOn]}
          >
            <Text style={[styles.chipTxt, filter === f.id && styles.chipTxtOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : filtered.length ? (
        <ScrollView contentContainerStyle={styles.list}>
          {filtered.map((t) => {
            const lane = vaultKindFromConversation(t.conversationKind);
            return (
              <Pressable
                key={t.id}
                style={styles.row}
                onPress={() => navigation.navigate('MessageThread', { threadId: t.id })}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.lane}>{vaultKindLabel(lane)}</Text>
                  {t.unreadCount > 0 ? (
                    <View style={styles.unread}>
                      <Text style={styles.unreadTxt}>{t.unreadCount}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  {t.contextHeadline}
                </Text>
                <Text style={styles.preview} numberOfLines={1}>
                  {t.lastPreview}
                </Text>
                {t.orderId ? (
                  <Text style={styles.ref}>Order · {t.orderId.slice(0, 8)}…</Text>
                ) : null}
                {t.offerId ? <Text style={styles.ref}>Trade offer · protected</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>
          No threads in this lane yet. Trade negotiations, order questions, and seller inquiries appear here with
          context — not generic DMs.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  filters: { gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  chipTxt: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTxtOn: { color: colors.gold },
  list: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  row: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lane: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 0.6, textTransform: 'uppercase' },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  preview: { fontSize: 13, color: colors.textMuted },
  ref: { fontSize: 11, color: colors.textSecondary },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: spacing.xl },
});
