import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchSellerShop, type SellerShopTab } from '../../api/sellerShopRepository';
import { fetchSellerFollowStatus, toggleSellerFollow } from '../../api/sellerFollowRepository';
import { fetchSellerReviews, type PublicSellerReview } from '../../api/sellerReviewsRepository';
import { setUserBlockedRemote } from '../../api/userBlockRepository';
import { useAuth } from '../../auth/AuthContext';
import { MarketplaceListingCard } from '../../components/discover/DiscoverMarketplaceCard';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { ProfilePullsGallery } from '../../components/profile/ProfilePullsGallery';
import { ReportSheet } from '../../components/trust/ReportSheet';
import { UserAvatar } from '../../components/ui/UserAvatar';
import {
  buildTrustRows,
  formatShowDate,
  profileLinkDisplay,
  profileShowCard,
  reviewSummaryLabel,
  safeProfileLinkUrl,
} from '../../lib/sellerProfileView';
import { useMarketplaceLayout } from '../../hooks/useMarketplaceLayout';
import { openMessageUser } from '../../navigation/openMessages';
import { openUserProfile } from '../../navigation/openPlatform';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme';

const GRID_COLS = 2;

const SHOP_TABS: { key: SellerShopTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'buy_now', label: 'Buy now' },
  { key: 'auctions', label: 'Auctions' },
  { key: 'sold', label: 'Sold' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'SellerShop'>;

export function SellerShopScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const layout = useMarketplaceLayout();
  const { user, session } = useAuth();
  const sellerId = route.params.sellerId;
  const initialTab = route.params.tab ?? 'all';

  const [tab, setTab] = useState<SellerShopTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [shop, setShop] = useState<Awaited<ReturnType<typeof fetchSellerShop>>>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [allReviews, setAllReviews] = useState<PublicSellerReview[] | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (opts?.refresh) setRefreshing(true);
      else setLoading(true);

      const result = await fetchSellerShop({
        sellerId,
        tab,
        accessToken: session?.access_token,
      });
      if (!result) {
        setNotFound(true);
        setShop(null);
      } else {
        setNotFound(false);
        setShop(result);
      }

      if (user?.id && user.id !== sellerId && session?.access_token) {
        const followStatus = await fetchSellerFollowStatus(sellerId, session.access_token);
        setFollowing(Boolean(followStatus?.following));
      }

      setLoading(false);
      setRefreshing(false);
    },
    [sellerId, session?.access_token, tab, user?.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const gridCols = GRID_COLS;
  const gridPad = layout.horizontalPadding;
  const cardGap = spacing.sm;

  const displayName = shop?.seller.username || shop?.seller.name?.trim() || 'Seller';
  const handle = shop?.seller.username ? `@${shop.seller.username}` : '@seller';
  const isOwnShop = user?.id === sellerId || shop?.seller.isOwnShop;

  const onFollow = useCallback(async () => {
    if (!user?.id || !session?.access_token) {
      Alert.alert('Sign in', 'Sign in to follow sellers.');
      return;
    }
    const prev = following;
    setFollowing(!prev);
    const result = await toggleSellerFollow(sellerId, prev, session.access_token);
    if (result.error) {
      setFollowing(prev);
      Alert.alert('Follow', result.error);
      return;
    }
    setFollowing(result.following);
  }, [following, sellerId, session?.access_token, user?.id]);

  const onBlock = useCallback(() => {
    if (!session?.access_token) {
      Alert.alert('Sign in', 'Sign in to block this user.');
      return;
    }
    Alert.alert(
      'Block user',
      `Block ${handle}? They won’t be able to find you or see your listings, shows, or profile — and you won’t see theirs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void setUserBlockedRemote(session.access_token!, sellerId, true)
              .then(() => {
                Alert.alert('Blocked', `${handle} is blocked.`);
                navigation.goBack();
              })
              .catch((e) => Alert.alert('Could not block', e instanceof Error ? e.message : 'Try again.'));
          },
        },
      ],
    );
  }, [handle, navigation, sellerId, session?.access_token]);

  const showAllReviews = useCallback(async () => {
    setLoadingReviews(true);
    const page = await fetchSellerReviews(sellerId, 1);
    if (page) setAllReviews(page.reviews);
    setLoadingReviews(false);
  }, [sellerId]);

  const openShow = useCallback(
    (streamId: string) => {
      navigation.navigate('MainTabs', {
        screen: 'Live',
        params: { screen: 'LiveRoom', params: { streamId } },
      });
    },
    [navigation],
  );

  const listHeader = useMemo(() => {
    if (!shop) return null;
    const card = profileShowCard(shop.shows);
    const links = (shop.seller.links ?? []).filter((l) => safeProfileLinkUrl(l.url));
    const levelLabel = shop.trust?.sellerLevelLabel;
    const salesCount = shop.trust?.ordersCompleted ?? shop.stats.orderCount;
    return (
      <View style={styles.headerBlock}>
        <View style={styles.banner}>
          {shop.seller.bannerUrl ? (
            <Image source={{ uri: shop.seller.bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
        </View>

        <View style={styles.hero}>
          <UserAvatar
            uri={shop.seller.image ?? undefined}
            name={displayName}
            username={shop.seller.username}
            size={84}
            tone="light"
            borderColor={colors.gold}
            borderWidth={2}
          />
          <View style={styles.heroText}>
            <Text style={styles.name}>{handle}</Text>
            <View style={styles.badges}>
              {levelLabel ? (
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeTxt}>{levelLabel}</Text>
                </View>
              ) : null}
              {shop.seller.verified ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedTxt}>Verified</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {shop.seller.bio ? <Text style={styles.bio}>{shop.seller.bio}</Text> : null}

        {links.length ? (
          <View style={styles.links}>
            {links.map((l) => (
              <Pressable
                key={l.key}
                style={styles.linkChip}
                accessibilityRole="link"
                accessibilityLabel={`${l.label} ${profileLinkDisplay(l)}`}
                onPress={() => {
                  const url = safeProfileLinkUrl(l.url);
                  if (url) void Linking.openURL(url).catch(() => Alert.alert('Link', 'Could not open that link.'));
                }}
              >
                <Text style={styles.linkChipLabel}>{l.label}</Text>
                <Text style={styles.linkChipTxt}>{profileLinkDisplay(l)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.stats}>
          <Stat label="Sales" value={String(salesCount)} />
          <Stat label="Followers" value={String(shop.stats.followerCount)} />
          {shop.shows ? <Stat label="Shows" value={String(shop.shows.totalShows)} /> : null}
          <Stat label="Listings" value={String(shop.stats.activeListings)} />
        </View>

        <View style={styles.actions}>
          {!isOwnShop ? (
            <>
              <Pressable style={[styles.btn, following && styles.btnOn]} onPress={() => void onFollow()}>
                <Text style={[styles.btnTxt, following && styles.btnTxtOn]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.btnGhost}
                onPress={() => {
                  if (!session?.access_token) {
                    Alert.alert('Sign in', 'Sign in to send a message.');
                    return;
                  }
                  openMessageUser(navigation, {
                    userId: sellerId,
                    username: shop.seller.username,
                    initialDraft: `Hi @${shop.seller.username}, `,
                  });
                }}
              >
                <Text style={styles.btnGhostTxt}>Message</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.btn} onPress={() => navigation.navigate('ProfileEdit')}>
              <Text style={styles.btnTxt}>Edit profile</Text>
            </Pressable>
          )}
          <Pressable style={styles.profileLink} onPress={() => openUserProfile(sellerId, navigation)}>
            <Text style={styles.profileLinkTxt}>Vault profile</Text>
          </Pressable>
        </View>

        {card ? (
          <Pressable
            style={[styles.showCard, card.isLive && styles.showCardLive]}
            disabled={!card.isLive}
            onPress={() => openShow(card.show.id)}
          >
            <View style={styles.showThumb}>
              {card.show.thumbnailUrl ? (
                <Image source={{ uri: card.show.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <Ionicons name="videocam-outline" size={22} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.showCardText}>
              <Text style={[styles.showKicker, card.isLive && styles.showKickerLive]}>{card.kicker}</Text>
              <Text style={styles.showCardTitle} numberOfLines={1}>
                {card.show.title}
              </Text>
              <Text style={styles.showCardMeta} numberOfLines={1}>
                {card.show.category}
              </Text>
            </View>
            {card.isLive ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
          </Pressable>
        ) : null}

        <View>
          <ProfilePullsGallery
            sellerId={sellerId}
            viewerAccessToken={session?.access_token}
            variant="shelf"
            hideWhenEmpty
          />
        </View>

        {shop.trust ? (
          <View style={styles.trustCard}>
            <Text style={styles.sectionKicker}>Trust</Text>
            <Text style={styles.trustDesc}>{shop.trust.sellerLevelDescription}</Text>
            {buildTrustRows(shop.trust, shop.reviews?.summary ?? null).map((r, i) => (
              <View key={r.label} style={[styles.trustRow, i === 0 && styles.trustRowFirst]}>
                <Text style={styles.trustLabel}>{r.label}</Text>
                <Text style={styles.trustValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Shop</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {SHOP_TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabOn]}
            >
              <Text style={[styles.tabTxt, tab === t.key && styles.tabTxtOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {shop.products.length ? (
          <Text style={styles.resultCount}>
            {shop.total} listing{shop.total === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>
    );
  }, [
    displayName,
    following,
    handle,
    isOwnShop,
    navigation,
    onFollow,
    openShow,
    sellerId,
    session?.access_token,
    shop,
    tab,
  ]);

  if (loading && !shop) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <PlatformFlowHeader title="Seller shop" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  if (notFound || !shop) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <PlatformFlowHeader title="Seller shop" onBack={() => navigation.goBack()} />
        <Text style={styles.muted}>This seller shop could not be found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingHorizontal: gridPad }]}>
      <PlatformFlowHeader title="Seller shop" onBack={() => navigation.goBack()} />
      <FlatList
        data={shop.products}
        keyExtractor={(item) => item.id}
        key={`seller-shop-grid-${gridCols}`}
        numColumns={gridCols}
        columnWrapperStyle={gridCols > 1 ? [styles.gridRow, { gap: cardGap }] : undefined}
        contentContainerStyle={styles.listBody}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<Text style={styles.muted}>{shop.emptyCopy}</Text>}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load({ refresh: true })} tintColor={colors.gold} />
        }
        renderItem={({ item }) => (
          <View style={{ marginBottom: cardGap }}>
            <MarketplaceListingCard
              product={item}
              imagePriority="low"
              onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
            />
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {shop.reviews ? (
              <View style={styles.recentBlock}>
                <View style={styles.recentHead}>
                  <Text style={styles.sectionTitle}>Reviews</Text>
                  {shop.reviews.summary.count > 0 ? (
                    <Text style={styles.recentCount}>{reviewSummaryLabel(shop.reviews.summary)} · verified buyers</Text>
                  ) : null}
                </View>
                {shop.reviews.summary.count === 0 ? (
                  <Text style={styles.reviewEmpty}>No reviews yet. Buyers can review a seller after delivery.</Text>
                ) : (
                  <View style={styles.recentList}>
                    {(allReviews ?? shop.reviews.recent).map((r, i) => (
                      <View key={r.id} style={[styles.reviewRow, i > 0 && styles.recentRowDivider]}>
                        <View style={styles.reviewHead}>
                          <Text style={styles.reviewStars}>
                            {'★'.repeat(r.rating)}
                            <Text style={styles.reviewStarsOff}>{'★'.repeat(5 - r.rating)}</Text>
                          </Text>
                          <Text style={styles.reviewBuyer}>@{r.buyer.username}</Text>
                          <Text style={styles.recentMeta}>{formatShowDate(r.createdAt)}</Text>
                        </View>
                        {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
                        {r.tags.length ? <Text style={styles.reviewTags}>{r.tags.join(' · ')}</Text> : null}
                      </View>
                    ))}
                  </View>
                )}
                {!allReviews && shop.reviews.summary.count > shop.reviews.recent.length ? (
                  <Pressable onPress={() => void showAllReviews()} disabled={loadingReviews} hitSlop={8}>
                    <Text style={styles.safetyLink}>
                      {loadingReviews ? 'Loading…' : `See all ${shop.reviews.summary.count} reviews`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {shop.shows?.recent.length ? (
              <View style={styles.recentBlock}>
                <View style={styles.recentHead}>
                  <Text style={styles.sectionTitle}>Recent shows</Text>
                  <Text style={styles.recentCount}>{shop.shows.totalShows} hosted</Text>
                </View>
                <View style={styles.recentList}>
                  {shop.shows.recent.map((s, i) => (
                    <View key={s.id} style={[styles.recentRow, i > 0 && styles.recentRowDivider]}>
                      <Text style={styles.recentTitle} numberOfLines={1}>
                        {s.title}
                      </Text>
                      <Text style={styles.recentMeta}>{formatShowDate(s.endedAt ?? s.startedAt)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {!isOwnShop ? (
              <View style={styles.safetyRow}>
                <Pressable onPress={() => setReportOpen(true)} hitSlop={8}>
                  <Text style={styles.safetyLink}>Report</Text>
                </Pressable>
                <Pressable onPress={onBlock} hitSlop={8}>
                  <Text style={styles.safetyLinkDanger}>Block</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={{ height: 120 }} />
          </View>
        }
      />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={sellerId}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listBody: { paddingBottom: spacing.xxxl },
  headerBlock: { gap: spacing.md, marginBottom: spacing.md },
  banner: {
    height: 120,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end', marginTop: -40, paddingHorizontal: spacing.sm },
  heroText: { flex: 1, gap: 6, paddingBottom: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  levelBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.goldSoft,
  },
  levelBadgeTxt: { fontSize: 10, fontWeight: '800', color: colors.gold, textTransform: 'uppercase', letterSpacing: 0.4 },
  bio: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkChipLabel: { fontSize: 12, color: colors.textMuted },
  linkChipTxt: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  showCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  showCardLive: { borderColor: 'rgba(255,59,48,0.5)', backgroundColor: 'rgba(255,59,48,0.08)' },
  showThumb: {
    width: 54,
    height: 54,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showCardText: { flex: 1, gap: 2 },
  showKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.textMuted },
  showKickerLive: { color: colors.live },
  showCardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  showCardMeta: { fontSize: 12, color: colors.textMuted },
  trustCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sectionKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textMuted },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  trustDesc: { marginTop: spacing.xs, marginBottom: spacing.sm, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  trustRowFirst: { borderTopWidth: StyleSheet.hairlineWidth },
  trustLabel: { fontSize: 13, color: colors.textMuted },
  trustValue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  footer: { gap: spacing.lg, marginTop: spacing.lg },
  recentBlock: { gap: spacing.sm },
  recentHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  recentCount: { fontSize: 12, color: colors.textMuted },
  recentList: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  recentRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  recentTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  recentMeta: { fontSize: 12, color: colors.textMuted },
  reviewEmpty: { fontSize: 13, color: colors.textMuted },
  reviewRow: { paddingVertical: spacing.md, gap: 4 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewStars: { fontSize: 13, color: colors.gold },
  reviewStarsOff: { color: colors.border },
  reviewBuyer: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  reviewBody: { fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  reviewTags: { fontSize: 11, color: colors.textMuted },
  safetyRow: { flexDirection: 'row', gap: spacing.xl, justifyContent: 'center' },
  safetyLink: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  safetyLinkDanger: { color: colors.live, fontSize: 13, fontWeight: '600' },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  name: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  subName: { fontSize: 14, color: colors.textSecondary },
  credibility: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  verifiedBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(90,200,250,0.35)',
    backgroundColor: 'rgba(90,200,250,0.12)',
  },
  verifiedTxt: { fontSize: 10, fontWeight: '800', color: '#9BD4FF', textTransform: 'uppercase' },
  stats: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 16, fontWeight: '800', color: colors.gold },
  statLbl: { fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  btn: {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  btnOn: { backgroundColor: colors.goldSoft },
  btnTxt: { fontWeight: '800', color: colors.background },
  btnTxtOn: { color: colors.textPrimary },
  btnGhost: {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  btnGhostTxt: { fontWeight: '800', color: colors.gold },
  profileLink: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  profileLinkTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.xs },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  tabTxt: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  tabTxtOn: { color: colors.gold },
  resultCount: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  gridRow: { justifyContent: 'flex-start' },
  muted: { color: colors.textMuted, fontSize: 14, marginTop: spacing.lg, textAlign: 'center' },
});
