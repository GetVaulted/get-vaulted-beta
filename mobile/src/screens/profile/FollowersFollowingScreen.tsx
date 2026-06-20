import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchAccountFollows,
  toggleSellerFollow,
  type AccountFollowUser,
} from '../../api/sellerFollowRepository';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { openUserProfile } from '../../navigation/openPlatform';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'FollowersFollowing'>;
type Tab = 'followers' | 'following';

function formatFollowDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function FollowRow({
  user,
  tab,
  accessToken,
  onUnfollowed,
  onPress,
}: {
  user: AccountFollowUser;
  tab: Tab;
  accessToken?: string;
  onUnfollowed: (userId: string) => void;
  onPress: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const unfollow = () => {
    if (!accessToken || busy) return;
    Alert.alert('Unfollow', `Stop following @${user.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfollow',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            const result = await toggleSellerFollow(user.userId, true, accessToken);
            setBusy(false);
            if (result.error) {
              Alert.alert('Unfollow', result.error);
              return;
            }
            onUnfollowed(user.userId);
          })();
        },
      },
    ]);
  };

  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}>
      <UserAvatar
        uri={user.image}
        name={user.username}
        username={user.username}
        size={44}
        tone="light"
        borderColor={colors.border}
        borderWidth={1}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>@{user.username}</Text>
        <Text style={styles.rowSub}>
          {tab === 'followers' ? 'Started following you' : 'Following since'} ·{' '}
          {formatFollowDate(user.followedAt)}
        </Text>
      </View>
      {tab === 'following' ? (
        <Pressable
          style={[styles.unfollowBtn, busy && styles.unfollowBtnBusy]}
          onPress={(e) => {
            e.stopPropagation?.();
            unfollow();
          }}
          disabled={busy}
        >
          <Text style={styles.unfollowBtnText}>{busy ? '…' : 'Following'}</Text>
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

export function FollowersFollowingScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;
  const initialTab = route.params?.tab ?? 'followers';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState<AccountFollowUser[]>([]);
  const [following, setFollowing] = useState<AccountFollowUser[]>([]);

  const load = useCallback(async () => {
    if (!token) {
      setFollowers([]);
      setFollowing([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchAccountFollows(token);
    setFollowers(data?.followers ?? []);
    setFollowing(data?.following ?? []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    setTab(route.params?.tab ?? 'followers');
  }, [route.params?.tab]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const rows = tab === 'followers' ? followers : following;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader
        title="Followers & Following"
        subtitle="See who follows you and who you follow"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.tabs}>
        {(['followers', 'following'] as const).map((key) => {
          const count = key === 'followers' ? followers.length : following.length;
          const active = tab === key;
          return (
            <Pressable
              key={key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {key === 'followers' ? 'Followers' : 'Following'}
              </Text>
              <View style={[styles.tabCount, active && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : !token ? (
        <Text style={styles.empty}>Sign in to view followers and following.</Text>
      ) : rows.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Ionicons
            name={tab === 'followers' ? 'people-outline' : 'person-add-outline'}
            size={32}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          </Text>
          <Text style={styles.empty}>
            {tab === 'followers'
              ? 'When collectors follow your shop, they will show up here.'
              : 'Follow sellers from live shows and marketplace listings to see them here.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {rows.map((user) => (
            <FollowRow
              key={user.userId}
              user={user}
              tab={tab}
              accessToken={token}
              onUnfollowed={(userId) => setFollowing((prev) => prev.filter((u) => u.userId !== userId))}
              onPress={() => openUserProfile(user.userId, navigation)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  tabActive: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,175,55,0.1)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.gold,
  },
  tabCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabCountActive: {
    backgroundColor: 'rgba(212,175,55,0.2)',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textMuted,
  },
  tabCountTextActive: {
    color: colors.gold,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  rowPressed: {
    backgroundColor: 'rgba(212,175,55,0.06)',
    borderColor: 'rgba(212,175,55,0.25)',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  rowSub: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  unfollowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  unfollowBtnBusy: {
    opacity: 0.6,
  },
  unfollowBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  emptyBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
