import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
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
import { fetchListingsBySeller } from '../../api/listingsFeedRepository';
import { fetchLiveShowsByHostId } from '../../api/liveShowsDiscoveryRepository';
import { fetchProfileById } from '../../api/profilesRepository';
import { fetchCompletedTradesForUser } from '../../api/tradeOffersRepository';
import { useAuth } from '../../auth/AuthContext';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { ReportSheet } from '../../components/trust/ReportSheet';
import { VaultImage } from '../../components/ui/VaultImage';
import { openDispute } from '../../navigation/openPlatform';
import { openMessageSellerForListing } from '../../navigation/openMessages';
import type { RootStackParamList } from '../../navigation/types';
import { computeTrustProfile } from '../../platform/computeTrustProfile';
import {
  followerCount,
  followingCount,
  isFollowing,
  isUserDeleted,
  listReviewsForUser,
  reviewStatsForUser,
  toggleFollow,
} from '../../platform/platformStore';
import type { TrustProfile } from '../../platform/trustTypes';
import type { ProfileLite } from '../../types/tradeOffers';
import type { TradeOfferVM } from '../../types/tradeOffers';
import type { LiveStream, Product, ScheduledStream } from '../../types';
import { colors, radii, spacing } from '../../theme';

type Tab = 'listings' | 'live' | 'trades' | 'reviews' | 'about';

const TABS: Tab[] = ['listings', 'live', 'trades', 'reviews', 'about'];

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

export function UserProfileScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();
  const userId = route.params.userId;
  const [reportOpen, setReportOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [followingUser, setFollowingUser] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [avgRating, setAvgRating] = useState(0);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof listReviewsForUser>>>([]);
  const [listings, setListings] = useState<Product[]>([]);
  const [liveNow, setLiveNow] = useState<LiveStream[]>([]);
  const [upcomingShows, setUpcomingShows] = useState<ScheduledStream[]>([]);
  const [pastShows, setPastShows] = useState<LiveStream[]>([]);
  const [completedTrades, setCompletedTrades] = useState<TradeOfferVM[]>([]);
  const [trust, setTrust] = useState<TrustProfile | null>(null);
  const [tab, setTab] = useState<Tab>('listings');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const gone = await isUserDeleted(userId);
    setDeleted(gone);
    if (gone) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const p = await fetchProfileById(userId);
    setProfile(p);
    const [fc, fg, stats, revs, listed, shows, trades] = await Promise.all([
      followerCount(userId),
      followingCount(userId),
      reviewStatsForUser(userId),
      listReviewsForUser(userId),
      fetchListingsBySeller({ sellerId: userId, limit: 12 }),
      fetchLiveShowsByHostId(userId),
      fetchCompletedTradesForUser(userId),
    ]);
    setFollowers(fc);
    setFollowing(fg);
    setReviewCount(stats.count);
    setAvgRating(stats.average);
    setReviews(revs);
    setListings(listed);
    setLiveNow(shows.live);
    setUpcomingShows(shows.scheduled);
    setPastShows(shows.ended);
    setCompletedTrades(trades);
    setTrust(
      await computeTrustProfile(userId, {
        completedTrades: trades.length,
        completedSales: stats.count,
      }),
    );
    if (user?.id) setFollowingUser(await isFollowing(user.id, userId));
    setLoading(false);
  }, [user?.id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = profile?.display_name?.trim() || profile?.username?.trim() || 'Collector';
  const handle = profile?.username ? `@${profile.username}` : '@vaulted';

  const onFollow = async () => {
    if (!user?.id) {
      Alert.alert('Sign in', 'Sign in to follow collectors and sellers.');
      return;
    }
    const now = await toggleFollow(user.id, userId);
    setFollowingUser(now);
    setFollowers((c) => (now ? c + 1 : Math.max(0, c - 1)));
  };

  const reportUser = () => setReportOpen(true);

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <PlatformFlowHeader title="Profile" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  if (deleted || !profile) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <PlatformFlowHeader title="Profile" onBack={() => navigation.goBack()} />
        <Text style={styles.muted}>This profile is no longer available.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <PlatformFlowHeader title="Vault profile" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <VaultImage
            uri={profile.avatar_url ?? 'https://api.dicebear.com/7.x/shapes/png?seed=vault'}
            width={72}
            height={72}
            borderRadius={36}
            priority="normal"
          />
          <View style={styles.heroText}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.handle}>{handle}</Text>
            <View style={styles.badges}>
              {liveNow.length ? (
                <View style={[styles.badge, styles.badgeLive]}>
                  <Text style={styles.badgeTxtLive}>Live now</Text>
                </View>
              ) : null}
              {trust?.trustedTraderTier && trust.trustedTraderTier !== 'none' ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{trust.trustedTraderTier} trader</Text>
                </View>
              ) : (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>Vault collector</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.stats}>
          <Stat label="Followers" value={String(followers)} />
          <Stat label="Following" value={String(following)} />
          <Stat label="Reviews" value={String(reviewCount)} />
          <Stat label="Rating" value={avgRating ? avgRating.toFixed(1) : '—'} />
        </View>

        <View style={styles.actions}>
          {user?.id !== userId ? (
            <Pressable style={[styles.btn, followingUser && styles.btnOn]} onPress={() => void onFollow()}>
              <Text style={[styles.btnTxt, followingUser && styles.btnTxtOn]}>
                {followingUser ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          ) : (
            <Pressable style={styles.btn} onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.btnTxt}>Settings</Text>
            </Pressable>
          )}
          {user?.id !== userId ? (
            <Pressable
              style={styles.btnGhost}
              onPress={() => {
                if (listings[0]) openMessageSellerForListing(navigation, { listingId: listings[0].id });
                else Alert.alert('Message', 'Browse their listings to start a thread.');
              }}
            >
              <Text style={styles.btnGhostTxt}>Message</Text>
            </Pressable>
          ) : null}
        </View>

        {trust ? (
          <View style={styles.trustRow}>
            <Text style={styles.trustTxt}>
              {trust.successfulTrades} trades · {trust.successfulSales} sales · score {trust.collectorScore}
            </Text>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtOn]}>
                {t === 'live' ? 'Live shows' : t}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'listings' ? (
          listings.length ? (
            <View style={styles.grid}>
              {listings.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('ProductDetail', { productId: p.id })}
                >
                  <VaultImage
                    uri={p.imageUrl}
                    width={LISTING_THUMB}
                    height={LISTING_THUMB}
                    borderRadius={radii.sm}
                    priority="low"
                  />
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {p.title}
                  </Text>
                  <Text style={styles.cardPrice}>{p.listingPrice}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>No marketplace listings yet.</Text>
          )
        ) : null}

        {tab === 'live' ? (
          <View style={styles.section}>
            {liveNow.map((s) => (
              <Pressable
                key={s.id}
                style={styles.showRow}
                onPress={() =>
                  navigation.navigate('MainTabs', {
                    screen: 'Live',
                    params: { screen: 'LiveRoom', params: { streamId: s.id } },
                  })
                }
              >
                <Text style={styles.showTitle}>{s.title}</Text>
                <Text style={styles.showMeta}>Live · {s.viewers} watching</Text>
              </Pressable>
            ))}
            {upcomingShows.map((s) => (
              <View key={s.id} style={styles.showRow}>
                <Text style={styles.showTitle}>{s.title}</Text>
                <Text style={styles.showMeta}>Upcoming vault event</Text>
              </View>
            ))}
            {pastShows.slice(0, 6).map((s) => (
              <View key={s.id} style={styles.showRow}>
                <Text style={styles.showTitle}>{s.title}</Text>
                <Text style={styles.showMeta}>Past show</Text>
              </View>
            ))}
            {!liveNow.length && !upcomingShows.length && !pastShows.length ? (
              <Text style={styles.muted}>No hosted shows yet.</Text>
            ) : null}
          </View>
        ) : null}

        {tab === 'trades' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLead}>
              {completedTrades.length} protected trade{completedTrades.length === 1 ? '' : 's'} completed
            </Text>
            {completedTrades.slice(0, 8).map((t) => (
              <View key={t.id} style={styles.showRow}>
                <Text style={styles.showTitle}>Vault trade</Text>
                <Text style={styles.showMeta}>Completed · protected lane</Text>
              </View>
            ))}
            {!completedTrades.length ? <Text style={styles.muted}>No completed trades on record yet.</Text> : null}
          </View>
        ) : null}

        {tab === 'reviews' ? (
          reviews.length ? (
            reviews.map((r) => (
              <View key={r.id} style={styles.review}>
                <Text style={styles.stars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                {r.tags?.length ? <Text style={styles.tags}>{r.tags.join(' · ')}</Text> : null}
                <Text style={styles.reviewBody}>{r.body}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No reviews yet.</Text>
          )
        ) : null}

        {tab === 'about' ? (
          <View style={styles.about}>
            <Text style={styles.aboutLine}>
              Collector identity on Get Vaulted — marketplace listings, live shows, protected trades, and vault
              reputation in one profile.
            </Text>
            {trust ? (
              <Text style={styles.aboutLine}>
                Dispute rate {trust.disputeRate}% · response {trust.responseRate}% · ship score{' '}
                {trust.shipSpeedScore}
              </Text>
            ) : null}
            <Pressable onPress={reportUser}>
              <Text style={styles.link}>Report user</Text>
            </Pressable>
            <Pressable onPress={() => openDispute({ contextType: 'trade', referenceId: userId }, navigation)}>
              <Text style={styles.linkDanger}>Open dispute (serious issue)</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={userId}
        accessToken={session?.access_token}
        title="Report user"
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const LISTING_THUMB = 120;

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { paddingBottom: spacing.xxxl, gap: spacing.md },
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: colors.border },
  heroText: { flex: 1, gap: 4 },
  name: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  handle: { fontSize: 14, color: colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: colors.gold },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  statLbl: { fontSize: 11, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  btnOn: { backgroundColor: colors.goldSoft },
  btnTxt: { fontWeight: '800', color: colors.background },
  btnTxtOn: { color: colors.textPrimary },
  btnGhost: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  btnGhostTxt: { fontWeight: '800', color: colors.gold },
  badgeLive: { backgroundColor: 'rgba(255,59,48,0.2)', borderColor: 'rgba(255,59,48,0.4)' },
  badgeTxtLive: { fontSize: 10, fontWeight: '800', color: colors.live },
  trustRow: {
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  trustTxt: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingBottom: spacing.xs },
  section: { gap: spacing.sm },
  sectionLead: { fontSize: 13, fontWeight: '700', color: colors.gold },
  showRow: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: 4,
  },
  showTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  showMeta: { fontSize: 12, color: colors.textMuted },
  tags: { fontSize: 11, color: colors.gold, fontWeight: '600' },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  tabTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'capitalize' },
  tabTxtOn: { color: colors.gold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    width: '48%',
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  cardPrice: { fontSize: 12, color: colors.gold, fontWeight: '800' },
  review: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  stars: { color: colors.gold, fontSize: 14 },
  reviewBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  about: { gap: spacing.md },
  aboutLine: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  link: { color: colors.gold, fontWeight: '700' },
  linkDanger: { color: colors.live, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 14 },
});
