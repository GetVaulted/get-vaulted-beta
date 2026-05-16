import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { User } from '@supabase/supabase-js';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  analyticsSnapshot,
  listingCounts,
  listingPreviews,
  liveCounts,
  liveSellerTools,
  orderCounts,
  orderRows,
  quickActions,
  sellerStudioRows,
  SELLER_HUB_TABS,
  streamCategories,
  type SellerHubTabId,
  vaultWins,
  walletSnapshot,
} from '../data/sellerHubMock';
import { LaunchVaultEventPanel } from './sellerHub/LaunchVaultEventPanel';
import { useCreateListingDraft } from '../createListing/CreateListingDraftContext';
import { openCreateListing } from '../navigation/openCreateListing';
import { navigateAuthLogin, navigateAuthSignUp, rootNavigationRef } from '../navigation/rootNavigationRef';
import { fetchProfileById } from '../api/profilesRepository';
import { useAuth } from '../auth/AuthContext';
import { LISTING_CHANNEL_CONFIG, channelFromPreview } from '../createListing/listingChannel';
import type { ListingChannel } from '../createListing/listingChannel';
import type { ListingPreview } from '../createListing/types';
import type { MainTabParamList } from '../navigation/types';
import type { ProfileLite } from '../types/tradeOffers';
import { colors, radii, spacing, typography } from '../theme';
import { sellerConnectBadge } from '../api/stripeConnectRepository';
import { useSellerStripeConnect } from '../hooks/useSellerStripeConnect';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { openStripeConnectOnboarding } from '../lib/openStripeConnectOnboarding';
import { areDevToolsEnabled } from '../lib/devTools';
import type { CategoryId } from '../types';

async function shareProfile(displayName: string) {
  try {
    await Share.share({ message: `Get Vaulted — ${displayName}` });
  } catch {
    /* dismissed */
  }
}

function statusStyle(status: (typeof listingPreviews)[0]['status']) {
  switch (status) {
    case 'active':
      return { bg: 'rgba(52,199,89,0.15)', fg: colors.success, label: 'Live' };
    case 'draft':
      return { bg: 'rgba(255,255,255,0.06)', fg: colors.textSecondary, label: 'Draft' };
    case 'sold':
      return { bg: 'rgba(212,175,55,0.12)', fg: colors.gold, label: 'Sold' };
    case 'expiring':
      return { bg: 'rgba(255,149,0,0.15)', fg: '#FFB340', label: 'Ending' };
    case 'pending':
      return { bg: 'rgba(100,149,237,0.15)', fg: '#8EBBFF', label: 'Pending' };
    case 'in_auction':
      return { bg: 'rgba(212,175,55,0.15)', fg: colors.gold, label: 'In auction' };
    default:
      return { bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted, label: status };
  }
}

export function SellerHubScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { user, loading: authLoading, session } = useAuth();
  const { userListings } = useCreateListingDraft();
  const sellerConnect = useSellerStripeConnect(session?.access_token);
  const [tab, setTab] = useState<SellerHubTabId>('overview');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleCategory, setScheduleCategory] = useState<CategoryId>(streamCategories[0].id);
  const [streamFormat, setStreamFormat] = useState<'auction' | 'break' | 'hybrid'>('hybrid');
  const [preloadInventory, setPreloadInventory] = useState(true);
  const [giveaways, setGiveaways] = useState(true);
  const [stripeSetupBusy, setStripeSetupBusy] = useState(false);

  const sellerLaunchMeta = useMemo(() => {
    const meta = user?.user_metadata as Record<string, unknown> | undefined;
    const displayName =
      typeof meta?.display_name === 'string'
        ? meta.display_name
        : typeof meta?.full_name === 'string'
          ? meta.full_name
          : user?.email?.split('@')[0] ?? 'Creator';
    const uname = typeof meta?.username === 'string' ? meta.username : null;
    const handle = uname ? `@${uname}` : '@you';
    const avatar =
      typeof meta?.avatar_url === 'string'
        ? meta.avatar_url
        : typeof meta?.picture === 'string'
          ? meta.picture
          : null;
    return { displayName, handle, avatar };
  }, [user]);

  const openStripeOnboarding = useCallback(async () => {
    const base = getWebApiBaseUrl();
    if (!base) {
      Alert.alert(
        'Configuration',
        'Set EXPO_PUBLIC_SITE_URL (or EXPO_PUBLIC_WEB_API_URL) to your deployed site that hosts the Stripe Connect API routes.',
      );
      return;
    }
    if (!session?.access_token) return;
    if (stripeSetupBusy) return;
    setStripeSetupBusy(true);
    try {
      const result = await openStripeConnectOnboarding(session.access_token);
      await sellerConnect.refresh();
      if (result === 'success') {
        Alert.alert(
          'Payout setup',
          'Thanks — we refreshed your payout status. If Stripe still needs info, tap Set up payouts again.',
        );
      }
    } catch (e) {
      Alert.alert('Could not start payout setup', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setStripeSetupBusy(false);
    }
  }, [session?.access_token, sellerConnect, stripeSetupBusy]);

  const renderTab = () => {
    switch (tab) {
      case 'listings':
        return <ListingsPanel navigation={navigation} />;
      case 'live':
        return (
          <LaunchVaultEventPanel
            sellerConnect={sellerConnect}
            scheduleTitle={scheduleTitle}
            setScheduleTitle={setScheduleTitle}
            scheduleCategory={scheduleCategory}
            setScheduleCategory={setScheduleCategory}
            streamFormat={streamFormat}
            setStreamFormat={setStreamFormat}
            preloadInventory={preloadInventory}
            setPreloadInventory={setPreloadInventory}
            giveaways={giveaways}
            setGiveaways={setGiveaways}
            sellerDisplayName={sellerLaunchMeta.displayName}
            sellerHandle={sellerLaunchMeta.handle}
            sellerAvatarUrl={sellerLaunchMeta.avatar}
            vaultListingCount={userListings.length}
            onBrowseLive={() => navigation.navigate('Live', { screen: 'LiveDiscovery' })}
          />
        );
      case 'orders':
        return <OrdersPanel navigation={navigation} />;
      case 'wallet':
        return <WalletPanel navigation={navigation} />;
      case 'analytics':
        return <AnalyticsPanel />;
      case 'vault':
        return <VaultIdentityPanel />;
      default:
        return (
          <OverviewBody
            onOpenTab={setTab}
            navigation={navigation}
            sellerConnect={sellerConnect}
            onStripeSetup={openStripeOnboarding}
            stripeSetupBusy={stripeSetupBusy}
          />
        );
    }
  };

  if (authLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, alignItems: 'center' }]}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.hqGateTitle}>Seller HQ</Text>
          <Text style={styles.hqGateBody}>
            Log in to manage listings, live tools, orders, and your seller profile. There is no guest dashboard.
          </Text>
          <Pressable style={styles.hqGatePrimary} onPress={navigateAuthSignUp}>
            <Text style={styles.hqGatePrimaryTxt}>Create account</Text>
          </Pressable>
          <Pressable style={styles.hqGateSecondary} onPress={navigateAuthLogin}>
            <Text style={styles.hqGateSecondaryTxt}>Log in</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <ScrollView
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ProfileHeader user={user} />
        <View style={[styles.tabBarWrap, { backgroundColor: colors.background }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            {SELLER_HUB_TABS.map((t) => {
              const on = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  style={[styles.tabChip, on && styles.tabChipOn]}
                >
                  <Text style={[styles.tabChipText, on && styles.tabChipTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.tabBody}>{renderTab()}</View>
        <View style={{ height: spacing.xxxl + 24 }} />
      </ScrollView>
    </View>
  );
}

function ProfileHeader({ user }: { user: User }) {
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileLite | null>(null);

  useEffect(() => {
    void fetchProfileById(user.id).then(setProfile);
  }, [user.id]);

  const displayName = useMemo(() => {
    return (
      profile?.display_name ??
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split('@')[0] ??
      'Seller'
    );
  }, [profile?.display_name, user.email, user.user_metadata]);

  const username = profile?.username ?? (user.user_metadata?.username as string | undefined) ?? null;
  const avatarUrl =
    profile?.avatar_url?.trim() ||
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined) ||
    null;

  const openProfileEdit = () => {
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('ProfileEdit');
    }
  };

  return (
    <View style={styles.headerBlock}>
      <LinearGradient
        colors={['rgba(212,175,55,0.12)', 'rgba(8,8,8,0)', 'rgba(5,5,5,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.headerTop}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{displayName.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.headerMain}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{displayName}</Text>
          </View>
          <Text style={styles.handle}>{username ? `@${username}` : 'Add a username in profile settings'}</Text>
          {user.email ? <Text style={styles.metaText}>{user.email}</Text> : null}
        </View>
      </View>
      <View style={styles.headerActions}>
        <Pressable style={styles.btnOutline} onPress={openProfileEdit}>
          <Text style={styles.btnOutlineText}>Edit profile</Text>
        </Pressable>
        <Pressable style={styles.btnGold} onPress={() => void shareProfile(displayName)}>
          <Ionicons name="share-outline" size={18} color="#0a0a0a" />
          <Text style={styles.btnGoldText}>Share</Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.signOutBtn}
        onPress={() => void signOut()}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
        <Text style={styles.signOutBtnText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function QuickActionRow({
  navigation,
  onOpenTab,
}: {
  navigation: BottomTabNavigationProp<MainTabParamList>;
  onOpenTab: (t: SellerHubTabId) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
      {quickActions.map((q) => (
        <Pressable
          key={q.id}
          style={styles.quickTile}
          onPress={() => {
            if (q.id === 'q1')
              void openCreateListing(navigation as unknown as NavigationProp<ParamListBase>, { channel: 'marketplace' });
            else if (q.id === 'q4')
              void openCreateListing(navigation as unknown as NavigationProp<ParamListBase>, { channel: 'live_show' });
            else if (q.id === 'q2' || q.id === 'q3') navigation.navigate('Live', { screen: 'LiveDiscovery' });
            else if (q.id === 'q5') onOpenTab('wallet');
          }}
        >
          <LinearGradient
            colors={['rgba(32,30,24,0.95)', 'rgba(12,11,9,0.98)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Ionicons name={q.icon} size={22} color={colors.gold} />
          <Text style={styles.quickLabel}>{q.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ModuleCard({
  title,
  subtitle,
  rows,
  onPress,
}: {
  title: string;
  subtitle: string;
  rows: { k: string; v: string }[];
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.module} onPress={onPress ?? (() => Alert.alert(title, subtitle))}>
      <View style={styles.moduleHead}>
        <View>
          <Text style={styles.moduleTitle}>{title}</Text>
          <Text style={styles.moduleSub}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      <View style={styles.moduleGrid}>
        {rows.map((r) => (
          <View key={r.k} style={styles.moduleCell}>
            <Text style={styles.moduleVal}>{r.v}</Text>
            <Text style={styles.moduleKey}>{r.k}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function SellerStudioSection({
  onOpenTab,
  navigation,
}: {
  onOpenTab: (t: SellerHubTabId) => void;
  navigation: BottomTabNavigationProp<MainTabParamList>;
}) {
  return (
    <>
      <Text style={styles.sectionLabel}>Studio & listings</Text>
      <View style={{ gap: spacing.md }}>
        {sellerStudioRows.map((row) => (
          <Pressable
            key={row.title}
            style={({ pressed }) => [styles.studioCard, pressed && styles.studioCardPressed]}
            onPress={() => {
              if (row.title === 'Create marketplace listing') {
                void openCreateListing(navigation as unknown as NavigationProp<ParamListBase>, {
                  channel: 'marketplace',
                });
              } else if (row.title === 'Queue live inventory') {
                void openCreateListing(navigation as unknown as NavigationProp<ParamListBase>, { channel: 'live_show' });
              } else if (row.opensTab) {
                onOpenTab(row.opensTab);
              } else {
                onOpenTab('listings');
              }
            }}
          >
            <View style={styles.studioIconBubble}>
              <Ionicons name={row.icon} size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.studioCardTitle}>{row.title}</Text>
              <Text style={styles.studioCardBody}>{row.body}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

function OverviewBody({
  onOpenTab,
  navigation,
  sellerConnect,
  onStripeSetup,
  stripeSetupBusy,
}: {
  onOpenTab: (t: SellerHubTabId) => void;
  navigation: BottomTabNavigationProp<MainTabParamList>;
  sellerConnect: { status: import('../api/stripeConnectRepository').SellerConnectStatusResponse | null; loading: boolean; refresh: () => Promise<void> };
  onStripeSetup: () => void;
  stripeSetupBusy: boolean;
}) {
  const badge = sellerConnect.status
    ? sellerConnectBadge(sellerConnect.status.onboarding_ui_status, sellerConnect.status.payouts_ready)
    : 'Not ready';
  const detailLine = sellerConnect.status?.stripeConfigured
    ? sellerConnect.status.can_publish_active_listings
      ? sellerConnect.status.message_payouts
      : sellerConnect.status.message_onboarding
    : null;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.payoutCard}>
        <View style={styles.payoutHeaderRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.payoutTitle}>Seller Payout Setup</Text>
            <Text style={styles.payoutSubtitle}>Connect your bank account securely through Stripe.</Text>
          </View>
          <View style={styles.payoutBadge}>
            <Text style={styles.payoutBadgeText}>{sellerConnect.loading ? '…' : badge}</Text>
          </View>
        </View>
        {detailLine ? (
          <Text style={styles.payoutDetail}>{detailLine}</Text>
        ) : (
          <Text style={styles.payoutDetailMuted}>
            {sellerConnect.status?.stripeConfigured === false
              ? 'Stripe is not configured in this build — seller gates are relaxed for development.'
              : 'Complete Stripe once to publish active listings and go live as a seller.'}
          </Text>
        )}
        <Pressable
          style={[styles.payoutCta, stripeSetupBusy && styles.payoutCtaDisabled]}
          onPress={onStripeSetup}
          disabled={stripeSetupBusy}
        >
          {stripeSetupBusy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Text style={styles.payoutCtaText}>Set up payouts</Text>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.background} />
            </>
          )}
        </Pressable>
      </View>

      <QuickActionRow navigation={navigation} onOpenTab={onOpenTab} />

      <SellerStudioSection onOpenTab={onOpenTab} navigation={navigation} />

      <Text style={styles.sectionLabel}>Command center</Text>
      <View style={styles.moduleStack}>
        <ModuleCard
          title="Listings"
          subtitle="Inventory & pricing"
          rows={[
            { k: 'Active', v: String(listingCounts.active) },
            { k: 'Drafts', v: String(listingCounts.drafts) },
            { k: 'Sold', v: String(listingCounts.sold) },
            { k: 'Expiring', v: String(listingCounts.expiring) },
          ]}
          onPress={() => onOpenTab('listings')}
        />
        <ModuleCard
          title="Live shows"
          subtitle="Rooms & schedules"
          rows={[
            { k: 'Upcoming', v: String(liveCounts.upcoming) },
            { k: 'Scheduled', v: String(liveCounts.scheduled) },
            { k: 'Draft rooms', v: String(liveCounts.drafts) },
            { k: 'Past', v: String(liveCounts.past) },
          ]}
          onPress={() => onOpenTab('live')}
        />
        <ModuleCard
          title="Orders"
          subtitle="Fulfillment & trust"
          rows={[
            { k: 'Ship', v: String(orderCounts.ship) },
            { k: 'Done', v: String(orderCounts.done) },
            { k: 'Disputes', v: String(orderCounts.disputes) },
            { k: 'Tracking', v: String(orderCounts.tracking) },
          ]}
          onPress={() => onOpenTab('orders')}
        />
        <ModuleCard
          title="Wallet"
          subtitle="Payouts & balance"
          rows={[
            { k: 'Available', v: walletSnapshot.available },
            { k: 'Pending', v: walletSnapshot.pending },
            { k: 'Lifetime', v: walletSnapshot.lifetime },
            { k: 'Withdraw', v: '→' },
          ]}
          onPress={() => onOpenTab('wallet')}
        />
        <ModuleCard
          title="Analytics"
          subtitle="Growth & performance"
          rows={[
            { k: '30d revenue', v: analyticsSnapshot.revenue30 },
            { k: 'Viewers', v: analyticsSnapshot.viewerGrowth },
            { k: 'Sell-through', v: analyticsSnapshot.sellThrough },
            { k: 'Top show', v: '···' },
          ]}
          onPress={() => onOpenTab('analytics')}
        />
      </View>

      <Text style={styles.sectionLabel}>Live seller tools</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolsRow}>
        {liveSellerTools.map((t) => (
          <Pressable
            key={t.id}
            style={styles.toolTile}
            onPress={() => navigation.navigate('Live', { screen: 'LiveDiscovery' })}
          >
            <Ionicons name={t.icon} size={20} color={colors.gold} />
            <Text style={styles.toolLabel}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {areDevToolsEnabled() ? (
        <>
          <Text style={styles.sectionLabel}>Developer tools</Text>
          <Pressable
            style={styles.devToolsCard}
            onPress={() =>
              navigation.navigate('TradeCenter', {
                screen: 'TradeCenterQa',
                params: undefined,
              })
            }
          >
            <Ionicons name="flask-outline" size={22} color={colors.gold} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.devToolsTitle}>Trade Center QA</Text>
              <Text style={styles.devToolsBody}>Seed trades, force statuses, mock labels, Stripe test checkout.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </>
      ) : null}

      <VaultIdentityPanel compact />
    </View>
  );
}

function listingChannelOf(L: ListingPreview): ListingChannel {
  return channelFromPreview(L.live, L.channel);
}

function ListingInventorySection({
  channel,
  navigation,
  listings,
  drafts,
}: {
  channel: ListingChannel;
  navigation: BottomTabNavigationProp<MainTabParamList>;
  listings: ListingPreview[];
  drafts: { id: string }[];
}) {
  const cfg = LISTING_CHANNEL_CONFIG[channel];
  const isLive = channel === 'live_show';

  const openNew = () => {
    void openCreateListing(navigation as unknown as NavigationProp<ParamListBase>, { channel });
  };

  return (
    <View style={[styles.listingSection, { borderColor: cfg.border, backgroundColor: cfg.fill }]}>
      <View style={styles.listingsHeaderRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.listingSectionTitleRow}>
            <Ionicons name={cfg.icon} size={18} color={cfg.primary} />
            <Text style={styles.listingsHeaderTitle}>{isLive ? 'Live show listings' : 'Marketplace listings'}</Text>
          </View>
          <Text style={styles.panelHint}>{cfg.helper}</Text>
        </View>
        <Pressable style={[styles.listingsNewBtn, { backgroundColor: cfg.primary }]} onPress={openNew}>
          <Ionicons name="add" size={20} color="#0a0a0a" />
          <Text style={styles.listingsNewBtnText}>New</Text>
        </Pressable>
      </View>
      {listings.length === 0 ? (
        <Text style={styles.listingSectionEmpty}>
          {isLive ? 'No show inventory yet — queue lots before you go live.' : 'No marketplace listings yet — start your storefront.'}
        </Text>
      ) : (
        listings.map((L) => {
          const st = statusStyle(L.status);
          return (
            <Pressable
              key={L.id}
              style={styles.listingCard}
              onPress={() => {
                if (L.status === 'draft') {
                  const hasDraft = drafts.some((d) => d.id === L.id);
                  void openCreateListing(
                    navigation as unknown as NavigationProp<ParamListBase>,
                    hasDraft ? { draftId: L.id } : { channel },
                  );
                  return;
                }
                if (rootNavigationRef.isReady()) {
                  rootNavigationRef.navigate('ProductDetail', { productId: L.id });
                }
              }}
            >
              <Image source={{ uri: L.imageUrl }} style={styles.listingImg} />
              <View style={styles.listingBody}>
                <View style={styles.listingTop}>
                  <Text style={styles.listingTitle} numberOfLines={2}>
                    {L.title}
                  </Text>
                  <View style={[styles.channelMiniPill, { borderColor: cfg.border }]}>
                    <Text style={[styles.channelMiniPillText, { color: cfg.primary }]}>{cfg.shortLabel}</Text>
                  </View>
                </View>
                <Text style={styles.listingPrice}>{L.price}</Text>
                <View style={styles.listingFoot}>
                  <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusPillText, { color: st.fg }]}>{st.label}</Text>
                  </View>
                  <Text style={styles.watchCount}>{L.watches} watching</Text>
                </View>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

function ListingsPanel({ navigation }: { navigation: BottomTabNavigationProp<MainTabParamList> }) {
  const { userListings, drafts } = useCreateListingDraft();
  const mergedListings = useMemo(() => {
    const ids = new Set(userListings.map((u) => u.id));
    return [...userListings, ...listingPreviews.filter((p) => !ids.has(p.id))];
  }, [userListings]);

  const marketplaceListings = useMemo(
    () => mergedListings.filter((L) => listingChannelOf(L) === 'marketplace'),
    [mergedListings],
  );
  const liveListings = useMemo(
    () => mergedListings.filter((L) => listingChannelOf(L) === 'live_show'),
    [mergedListings],
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <ListingInventorySection
        channel="marketplace"
        navigation={navigation}
        listings={marketplaceListings}
        drafts={drafts}
      />
      <ListingInventorySection channel="live_show" navigation={navigation} listings={liveListings} drafts={drafts} />
    </View>
  );
}

function OrdersPanel({ navigation }: { navigation: BottomTabNavigationProp<MainTabParamList> }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {orderRows.map((o) => (
        <Pressable
          key={o.id}
          style={styles.orderRow}
          onPress={() => navigation.navigate('TradeCenter', { screen: 'TradeCenterHome' })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.orderItem}>{o.item}</Text>
            <Text style={styles.orderBuyer}>{o.buyer}</Text>
          </View>
          <Text style={styles.orderAmt}>{o.amount}</Text>
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeText}>{o.state}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function WalletPanel({ navigation }: { navigation: BottomTabNavigationProp<MainTabParamList> }) {
  return (
    <View style={styles.walletHero}>
      <Text style={styles.walletLabel}>Available</Text>
      <Text style={styles.walletBig}>{walletSnapshot.available}</Text>
      <View style={styles.walletRow}>
        <View>
          <Text style={styles.walletMuted}>Pending</Text>
          <Text style={styles.walletMid}>{walletSnapshot.pending}</Text>
        </View>
        <View>
          <Text style={styles.walletMuted}>Lifetime</Text>
          <Text style={styles.walletMid}>{walletSnapshot.lifetime}</Text>
        </View>
      </View>
      <Pressable
        style={styles.withdrawBtn}
        onPress={() => navigation.navigate('TradeCenter', { screen: 'TradeCenterHome' })}
      >
        <Text style={styles.withdrawBtnText}>Withdraw funds</Text>
      </Pressable>
    </View>
  );
}

function AnalyticsPanel() {
  const bars = [52, 68, 44, 72, 58, 80, 64];
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsBig}>{analyticsSnapshot.revenue30}</Text>
        <Text style={styles.analyticsCaption}>Trailing 30 days · gross merchandise</Text>
        <View style={styles.barRow}>
          {bars.map((h, i) => (
            <View key={i} style={[styles.bar, { height: h }]} />
          ))}
        </View>
      </View>
      <View style={styles.kpiGrid}>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Viewer growth</Text>
          <Text style={styles.kpiVal}>{analyticsSnapshot.viewerGrowth}</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Sell-through</Text>
          <Text style={styles.kpiVal}>{analyticsSnapshot.sellThrough}</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Top stream</Text>
          <Text style={styles.kpiValSm} numberOfLines={2}>
            {analyticsSnapshot.topStream}
          </Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Engagement</Text>
          <Text style={styles.kpiValSm}>{analyticsSnapshot.engagement}</Text>
        </View>
      </View>
    </View>
  );
}

function VaultIdentityPanel({ compact }: { compact?: boolean }) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.vaultHead}>
        <Text style={styles.sectionLabel}>Vault identity</Text>
        {!compact ? <Text style={styles.vaultSub}>Verified grails · recent wins · collector rep</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vaultRail}>
        {vaultWins.map((v) => (
          <View key={v.id} style={styles.vaultCard}>
            <Image source={{ uri: v.imageUrl }} style={styles.vaultImg} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.85)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.vaultCap}>
              <Text style={styles.vaultGrade}>{v.grade}</Text>
              <Text style={styles.vaultLbl} numberOfLines={2}>
                {v.label}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      {!compact ? (
        <View style={styles.repRow}>
          <Ionicons name="ribbon-outline" size={18} color={colors.gold} />
          <Text style={styles.repText}>Reputation: Vault Verified Seller · Top 1% sell-through</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hqGateTitle: {
    ...typography.title,
    fontSize: 22,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  hqGateBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.md,
  },
  hqGatePrimary: {
    marginTop: spacing.xl,
    backgroundColor: colors.gold,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  hqGatePrimaryTxt: { color: colors.background, fontWeight: '800', fontSize: 16 },
  hqGateSecondary: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  hqGateSecondaryTxt: { color: colors.gold, fontWeight: '800', fontSize: 16 },
  headerBlock: {
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTop: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  avatarFallbackText: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: '800',
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  displayName: {
    ...typography.title,
    fontSize: 20,
    color: colors.textPrimary,
  },
  handle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: 4,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  metaDot: {
    color: colors.textMuted,
    marginHorizontal: 2,
  },
  bio: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  specRow: {
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingRight: spacing.lg,
  },
  specChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  specChipText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
  },
  upcomingLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  upcomingTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  upcomingMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  btnOutline: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
  },
  btnOutlineText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  btnGold: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGoldText: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 14,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  signOutBtnText: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 14,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.45)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
  },
  livePillText: {
    color: colors.live,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tabBarWrap: {
    paddingVertical: spacing.sm,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  tabChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabChipOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  tabChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tabChipTextOn: {
    color: colors.gold,
  },
  tabBody: {
    marginTop: spacing.lg,
  },
  sectionLabel: {
    ...typography.micro,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    letterSpacing: 1.2,
  },
  quickRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  quickTile: {
    width: 108,
    height: 96,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  quickLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  moduleStack: {
    gap: spacing.md,
  },
  module: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  moduleHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  moduleTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  moduleSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  moduleCell: {
    width: '47%',
  },
  moduleVal: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  moduleKey: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  toolsRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toolTile: {
    width: 118,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  toolLabel: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  devToolsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  devToolsTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  devToolsBody: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  panelHint: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  listingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  listingsHeaderTitle: {
    ...typography.title,
    fontSize: 20,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  listingsNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  listingsNewBtnText: {
    color: '#0a0a0a',
    fontSize: 14,
    fontWeight: '800',
  },
  listingSection: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  listingSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  listingSectionEmpty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: spacing.sm,
  },
  channelMiniPill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  channelMiniPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  listingCard: {
    flexDirection: 'row',
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  listingImg: {
    width: 100,
    height: 112,
  },
  listingBody: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  listingTop: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  listingTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  listingPrice: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  listingFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  watchCount: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  liveBadge: {
    backgroundColor: 'rgba(255,59,48,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: colors.live,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  payoutCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.sm,
  },
  payoutHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  payoutTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  payoutSubtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  payoutBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  payoutBadgeText: { color: colors.gold, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  payoutDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  payoutDetailMuted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  payoutCta: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    minHeight: 48,
  },
  payoutCtaDisabled: { opacity: 0.65 },
  payoutCtaText: { color: colors.background, fontWeight: '900', fontSize: 15 },
  showRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.md,
  },
  showTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  showMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  showState: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(212,175,55,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  showStateMuted: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: colors.border,
  },
  showStateText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
  },
  orderItem: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  orderBuyer: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  orderAmt: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 14,
  },
  orderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  orderBadgeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  walletHero: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  walletLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  walletBig: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  walletMuted: {
    color: colors.textMuted,
    fontSize: 12,
  },
  walletMid: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  withdrawBtn: {
    marginTop: spacing.lg,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  withdrawBtnText: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 15,
  },
  analyticsCard: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  analyticsBig: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  analyticsCaption: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: spacing.lg,
    height: 88,
  },
  bar: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: colors.gold,
    opacity: 0.75,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  kpi: {
    width: '47%',
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kpiLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  kpiVal: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  kpiValSm: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  vaultHead: {
    marginTop: spacing.sm,
  },
  vaultSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  vaultRail: {
    gap: spacing.md,
  },
  vaultCard: {
    width: 140,
    height: 180,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  vaultImg: {
    ...StyleSheet.absoluteFillObject,
  },
  vaultCap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
  },
  vaultGrade: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  vaultLbl: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  repRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  repText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  studioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  studioCardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
  studioIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.goldSoft,
  },
  studioCardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  studioCardBody: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
