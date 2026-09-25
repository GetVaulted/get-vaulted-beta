import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import {
  fetchAdminLiveShows,
  postAdminLiveShowAction,
  type AdminLiveShow,
} from '../../api/adminOpsApi';
import {
  AdminActionButton,
  AdminEmpty,
  AdminFilterChips,
  AdminListRow,
  AdminScreenShell,
} from '../../components/admin/adminUi';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminLiveShows'>;
type StatusFilter = 'live' | 'scheduled' | 'ended' | 'all';

export function AdminLiveShowsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [status, setStatus] = useState<StatusFilter>('live');
  const [shows, setShows] = useState<AdminLiveShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
        const data = await fetchAdminLiveShows(token, status);
        setShows(data.shows);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load shows');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, status],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const runAction = (show: AdminLiveShow, action: 'end' | 'cancel' | 'flag') => {
    if (!token) return;
    const labels = { end: 'End show', cancel: 'Cancel show', flag: 'Flag for review' };
    Alert.alert(labels[action], `${show.title}\n@${show.host.username}`, [
      { text: 'Back', style: 'cancel' },
      {
        text: labels[action],
        style: action === 'flag' ? 'default' : 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(show.id);
            try {
              await postAdminLiveShowAction(token, show.id, action);
              await load(true);
            } catch (e) {
              Alert.alert('Action failed', e instanceof Error ? e.message : 'Try again');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <AdminScreenShell
      title="Live shows"
      subtitle="End, cancel, or flag rooms"
      onBack={() => navigation.goBack()}
      loading={loading && shows.length === 0}
      error={error && shows.length === 0 ? error : null}
      onRetry={() => void load()}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load(true);
      }}
    >
      <AdminFilterChips
        options={[
          { id: 'live', label: 'Live' },
          { id: 'scheduled', label: 'Scheduled' },
          { id: 'ended', label: 'Ended' },
          { id: 'all', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {shows.length === 0 ? (
        <AdminEmpty message="No shows in this filter." />
      ) : (
        shows.map((show) => {
          const pausedHint =
            show.status === 'live' && !show.ivsCompositionArn ? ' · AWS cut' : '';
          return (
            <View key={show.id} style={{ gap: spacing.sm }}>
              <AdminListRow
                title={show.title}
                meta={`@${show.host.username} · ${show.viewerCount} viewers · ${show.streamHealth}${pausedHint}`}
                badge={show.status}
                badgeWarn={show.status === 'live'}
                onPress={() =>
                  navigation.navigate('MainTabs', {
                    screen: 'Live',
                    params: { screen: 'LiveRoom', params: { streamId: show.id } },
                  })
                }
              />
              {(show.status === 'live' || show.status === 'scheduled') && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {show.status === 'live' ? (
                    <View style={{ flex: 1, minWidth: 100 }}>
                      <AdminActionButton
                        label={busyId === show.id ? '…' : 'End'}
                        tone="danger"
                        disabled={busyId === show.id}
                        onPress={() => runAction(show, 'end')}
                      />
                    </View>
                  ) : null}
                  <View style={{ flex: 1, minWidth: 100 }}>
                    <AdminActionButton
                      label="Cancel"
                      tone="danger"
                      disabled={busyId === show.id}
                      onPress={() => runAction(show, 'cancel')}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 100 }}>
                    <AdminActionButton
                      label="Flag"
                      disabled={busyId === show.id}
                      onPress={() => runAction(show, 'flag')}
                    />
                  </View>
                </View>
              )}
              {show.activeItem ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
                  Active: {show.activeItem.title}
                  {show.activeItem.currentBidUsd != null
                    ? ` · $${show.activeItem.currentBidUsd.toFixed(2)}`
                    : ''}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </AdminScreenShell>
  );
}
