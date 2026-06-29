import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchLiveGiveawayEntries,
  type GiveawayEntryRow,
} from '../../../api/liveGiveawayRepository';
import { colors, radii, spacing } from '../../../theme';

function entryMethodLabel(method: GiveawayEntryRow['method']): string | null {
  switch (method) {
    case 'purchase':
      return 'Purchase';
    case 'amoe_form':
      return 'AMOE';
    case 'watch_enter':
      return 'In show';
    default:
      return null;
  }
}

type Props = {
  accessToken: string;
  roomId: string;
  giveawayId: string;
  kind: 'open' | 'buyers';
  showActiveInRoom?: boolean;
  refreshKey?: string | number;
};

export function SellerGiveawayEntrantList({
  accessToken,
  roomId,
  giveawayId,
  kind,
  showActiveInRoom = false,
  refreshKey = 0,
}: Props) {
  const [entries, setEntries] = useState<GiveawayEntryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchLiveGiveawayEntries(accessToken, roomId, giveawayId);
      setEntries(rows);
    } catch (e) {
      setEntries(null);
      setError(e instanceof Error ? e.message : 'Could not load entrants.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, giveawayId, roomId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.gold} size="small" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={() => void load()} hitSlop={8}>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!entries?.length) {
    return <Text style={styles.empty}>No entrants yet.</Text>;
  }

  return (
    <ScrollView style={styles.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
      {entries.map((entry, index) => {
        const methodLabel = kind === 'buyers' ? entryMethodLabel(entry.method) : null;
        const inactive =
          showActiveInRoom && entry.method === 'watch_enter' && entry.activeInRoom === false;
        return (
          <View key={entry.userId} style={styles.row}>
            <Text style={styles.index}>{index + 1}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.username} numberOfLines={1}>
                @{entry.username}
              </Text>
              {methodLabel ? <Text style={styles.method}>{methodLabel}</Text> : null}
              {inactive ? <Text style={styles.inactive}>Left show</Text> : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emptyWrap: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  empty: {
    fontSize: 12,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  error: {
    fontSize: 12,
    color: '#fca5a5',
  },
  retry: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6ee7b7',
  },
  list: {
    maxHeight: 160,
    marginTop: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  index: {
    width: 18,
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  username: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  method: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  inactive: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fcd34d',
    textTransform: 'uppercase',
  },
});
