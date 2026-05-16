import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchLiveShowsForDiscovery } from '../api/liveShowsDiscoveryRepository';
import { fetchMarketplaceListings } from '../api/listingsFeedRepository';
import { PremiumEmptyPanel } from '../components/empty/PremiumEmptyPanel';
import { FeaturedCreatorCard } from '../components/home/FeaturedCreatorCard';
import { HotClipCard } from '../components/home/HotClipCard';
import { LiveNowPreviewCard } from '../components/home/LiveNowPreviewCard';
import { MomentumStrip } from '../components/home/MomentumStrip';
import { VaultDropCard } from '../components/home/VaultDropCard';
import { BrandLogo } from '../components/ui/BrandLogo';
import { LiveBadge } from '../components/ui/LiveBadge';
import { LiveEmptyBroadcastBlock } from '../components/live/LiveEmptyBroadcastBlock';
import { ProductCard } from '../components/ui/ProductCard';
import { ShimmerRail } from '../components/ui/ShimmerRail';
import { SearchBar } from '../components/ui/SearchBar';
import { SectionHeader } from '../components/ui/SectionHeader';
import { isSupabaseConfigured } from '../lib/supabase';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { alertGuestLiveRestricted } from '../navigation/guestExploreGuards';
import { SellerHQEntryBanner } from '../components/seller/SellerHQEntryBanner';
import { useAuth } from '../auth/AuthContext';
import { useSellerStripeConnect } from '../hooks/useSellerStripeConnect';
import type { SellerHQEntryPhase } from '../lib/sellerHubEntry';
import { openSellerHQ } from '../navigation/openSellerHQ';
import { navigateAuthSignUp } from '../navigation/rootNavigationRef';
import { colors, radii, spacing, typography } from '../theme';
import type { FeaturedCreator, HotClip, LiveStream, Product, ScheduledStream } from '../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, guestExploreMode, session } = useAuth();
  const sellerConnect = useSellerStripeConnect(session?.access_token);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<Product[]>([]);
  const [liveRows, setLiveRows] = useState<LiveStream[]>([]);
  const [scheduledRows, setScheduledRows] = useState<ScheduledStream[]>([]);
  const [creators, setCreators] = useState<FeaturedCreator[]>([]);
  const [clips, setClips] = useState<HotClip[]>([]);

  const loadFeed = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setListings([]);
      setLiveRows([]);
      setScheduledRows([]);
      setCreators([]);
      setClips([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [products, livePack] = await Promise.all([
        fetchMarketplaceListings({ limit: 24 }),
        fetchLiveShowsForDiscovery(),
      ]);
      setListings(products);
      setLiveRows(livePack.live);
      setScheduledRows(livePack.scheduled);
      setCreators([]);
      setClips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const goLive = () => {
    navigation.navigate('Live', { screen: 'LiveDiscovery' });
  };

  const goSchedule = () => {
    openSellerHQ(navigation, { tab: 'live' });
  };

  const onSellerHQEntry = (phase: SellerHQEntryPhase) => {
    if (phase === 'guest') {
      navigateAuthSignUp();
      return;
    }
    openSellerHQ(navigation, { tab: 'overview' });
  };

  const openLiveShow = (streamId: string) => {
    if (guestExploreMode) {
      alertGuestLiveRestricted();
      return;
    }
    navigation.navigate('Live', {
      screen: 'LiveRoom',
      params: { streamId },
    });
  };

  const goDiscover = () => {
    navigation.navigate('Discover');
  };

  const openProduct = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const showLiveSkeleton = loading;
  const showListingSkeleton = loading;

  const heroCopy = useMemo(
    () => ({
      kicker: 'The premium live home for breaker culture.',
      title: 'Built for the Breaks.',
      body: 'Sports cards, memorabilia, sneakers, watches, and live auctions — one platform for collectors who want the rush without the noise.',
    }),
    [],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.brandRow}>
          <View style={styles.brandTextCol}>
            <BrandLogo width={210} accessibilityLabel="Get Vaulted" />
            <Text style={styles.tagline}>The premium live collectible network.</Text>
          </View>
          <Pressable style={styles.bell} onPress={goLive}>
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
        <SearchBar />

        <SellerHQEntryBanner
          hasUser={Boolean(user)}
          connect={sellerConnect.status}
          connectLoading={sellerConnect.loading}
          onPress={onSellerHQEntry}
        />

        <LinearGradient
          colors={['#221a0a', '#0d0b06', '#050505']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroLiveRow}>
            <LiveBadge />
            <Text style={styles.heroLiveMeta}>Break rooms & live pulls</Text>
          </View>
          <Text style={styles.heroKicker}>{heroCopy.kicker}</Text>
          <Text style={styles.heroTitle}>{heroCopy.title}</Text>
          <Text style={styles.heroBody}>{heroCopy.body}</Text>
          <View style={styles.heroCtaRow}>
            <Pressable style={styles.heroCtaPrimary} onPress={goLive}>
              <Ionicons name="play" size={18} color="#0a0a0a" />
              <Text style={styles.heroCtaPrimaryText}>Live hub</Text>
            </Pressable>
            <Pressable style={styles.heroCtaSecondary} onPress={goSchedule}>
              <Ionicons name="storefront-outline" size={18} color={colors.gold} />
              <Text style={styles.heroCtaSecondaryText}>Seller HQ</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <MomentumStrip />

        <SectionHeader title="Live now" actionLabel="See all" onPressAction={goLive} />
        {showLiveSkeleton ? (
          <View style={styles.skelBlock}>
            <ActivityIndicator color={colors.gold} style={{ marginBottom: spacing.sm }} />
            <ShimmerRail count={3} height={200} />
          </View>
        ) : liveRows.length ? (
          <FlatList
            horizontal
            data={liveRows}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hList}
            renderItem={({ item, index }) => (
              <LiveNowPreviewCard
                stream={item}
                variant={index === 0 ? 'spotlight' : 'standard'}
                onPress={() => openLiveShow(item.id)}
              />
            )}
          />
        ) : (
          <LiveEmptyBroadcastBlock
            useDefaultTabActions={false}
            onStartLive={() => openSellerHQ(navigation, { tab: 'live' })}
            onExploreListings={() => navigation.navigate('Discover')}
          />
        )}

        <SectionHeader title="Upcoming shows" />
        {scheduledRows.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {scheduledRows.map((s) => (
              <VaultDropCard
                key={s.id}
                event={s}
                onRemind={() => {
                  /* Reminders wire to notifications service */
                }}
              />
            ))}
          </ScrollView>
        ) : (
          <PremiumEmptyPanel
            icon="calendar-outline"
            title="No scheduled drops yet"
            subtitle="The next break is loading — schedule from Seller HQ when you are ready."
            actions={[
              {
                label: 'Schedule your first live show',
                onPress: () => openSellerHQ(navigation, { tab: 'live' }),
              },
            ]}
          />
        )}

        <SectionHeader title="Featured hosts" actionLabel="Discover" onPressAction={goDiscover} />
        {creators.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {creators.map((c) => (
              <FeaturedCreatorCard
                key={c.host.id}
                creator={c}
                onFollow={() => {
                  /* Follow action — account gated in product */
                }}
              />
            ))}
          </ScrollView>
        ) : (
          <PremiumEmptyPanel
            icon="people-outline"
            title="Hosts will appear here."
            subtitle="Verified sellers and breakers surface on the network as they go live."
          />
        )}

        <SectionHeader title="Vault listings" actionLabel="Discover" onPressAction={goDiscover} />
        {showListingSkeleton ? (
          <View style={styles.skelBlock}>
            <ShimmerRail count={4} height={260} />
          </View>
        ) : listings.length ? (
          <FlatList
            horizontal
            data={listings}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hList}
            renderItem={({ item }) => <ProductCard product={item} onPress={() => openProduct(item)} />}
          />
        ) : (
          <PremiumEmptyPanel
            icon="archive-outline"
            title="No vault listings yet."
            subtitle="Your next grail starts here. Listings from the community will populate this rail as sellers publish live inventory."
          />
        )}

        {clips.length ? (
          <>
            <SectionHeader title="Hit clips" actionLabel="Share" onPressAction={goLive} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {clips.map((clip) => (
                <HotClipCard key={clip.id} clip={clip} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    paddingBottom: 120,
  },
  skelBlock: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  brandTextCol: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.md,
  },
  tagline: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: 13,
  },
  bell: {
    padding: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  hero: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.sm,
  },
  heroLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  heroLiveMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  heroKicker: {
    ...typography.micro,
    color: colors.gold,
  },
  heroTitle: {
    ...typography.hero,
    color: colors.textPrimary,
  },
  heroBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  heroCtaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heroCtaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  heroCtaPrimaryText: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 15,
  },
  heroCtaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroCtaSecondaryText: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 15,
  },
  hList: {
    paddingRight: spacing.lg,
    gap: spacing.sm,
  },
});
