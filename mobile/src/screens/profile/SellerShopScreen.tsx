import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useAuth } from '../../auth/AuthContext';
import { MarketplaceListingCard } from '../../components/discover/DiscoverMarketplaceCard';
import { PlatformFlowHeader } from '../../components/platform/PlatformFlowHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
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

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (opts?.refresh) setRefreshing(true);
      else setLoading(true);

      const result = await fetchSellerShop({ sellerId, tab });
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

  const displayName = shop?.seller.name?.trim() || shop?.seller.username || 'Seller';
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

  const listHeader = useMemo(() => {
    if (!shop) return null;
    return (
      <View style={styles.headerBlock}>
        <View style={styles.hero}>
          <UserAvatar
            uri={shop.seller.image ?? undefined}
            name={displayName}
            username={shop.seller.username}
            size={72}
            tone="light"
            borderColor={colors.borderStrong}
            borderWidth={1}
          />
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Seller shop</Text>
            <Text style={styles.name}>{handle}</Text>
            {shop.seller.name ? <Text style={styles.subName}>{shop.seller.name}</Text> : null}
            <Text style={styles.credibility}>{shop.seller.credibility}</Text>
            {shop.seller.verified ? (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedTxt}>Verified</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.stats}>
          <Stat label="Active" value={String(shop.stats.activeListings)} />
          <Stat label="Sold" value={String(shop.stats.soldListings)} />
          <Stat label="Live auctions" value={String(shop.stats.auctionsLive)} />
          <Stat label="Followers" value={String(shop.stats.followerCount)} />
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
          ) : null}
          <Pressable style={styles.profileLink} onPress={() => openUserProfile(sellerId, navigation)}>
            <Text style={styles.profileLinkTxt}>Vault profile</Text>
          </Pressable>
        </View>

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
        ListFooterComponent={<View style={{ height: 120 }} />}
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
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  heroText: { flex: 1, gap: 4 },
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
