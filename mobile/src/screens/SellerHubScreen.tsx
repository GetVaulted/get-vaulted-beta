import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  streamCategories,
  type SellerHubTabId,
  vaultWins,
  walletSnapshot,
} from '../data/sellerHubMock';
import { SellerHubTabBar } from '../components/seller/hq/SellerHubTabBar';
import { mainTabBarClearance } from '../lib/mainTabBarMetrics';
import { LaunchVaultEventPanel } from './sellerHub/LaunchVaultEventPanel';
import { SellerShipFromSetupCard } from '../components/seller/hq/SellerShipFromSetupCard';
import { SellerSetupGatePanel } from '../components/seller/hq/SellerSetupGatePanel';
import { useCreateListingDraft } from '../createListing/CreateListingDraftContext';
import { openCreateListing } from '../navigation/openCreateListing';
import { openContactSupport } from '../navigation/openPlatform';
import { openSellerSetup } from '../navigation/openSellerSetup';
import { AccountAccessBar } from '../components/account/AccountAccessBar';
import { SellerHQCommandCenter } from '../components/seller/hq/SellerHQCommandCenter';
import { SellerHQFab, type FabActionId } from '../components/seller/hq/SellerHQFab';
import type { SellerHQEntryPhase } from '../lib/sellerHubEntry';
import { useSellerSetupState } from '../hooks/useSellerSetupState';
import { openSellerHostRoom } from '../navigation/openSellerHostRoom';
import { openSellerListingManagementFromTab } from '../navigation/openSellerListingManagement';
import { consumePendingSellerHQTab, setPendingVaultEventSchedule } from '../navigation/openSellerHQ';
import { navigateAuthLogin, navigateAuthSignUp, rootNavigationRef } from '../navigation/rootNavigationRef';
import { useAuth } from '../auth/AuthContext';
import { LISTING_CHANNEL_CONFIG } from '../createListing/listingChannel';
import type { ListingChannel } from '../createListing/listingChannel';
import type { ListingPreview } from '../createListing/types';
import type { MainTabParamList } from '../navigation/types';
import { colors, radii, spacing, typography } from '../theme';
import {
  isSellerPayoutSetupComplete,
  sellerConnectBadge,
  sellerConnectDetailMessage,
} from '../api/stripeConnectRepository';
import { useSellerCommandCenterData } from '../hooks/useSellerCommandCenterData';
import { useSellerInventory } from '../hooks/useSellerInventory';
import { sellerHasShipFromAddress } from '../lib/seller-shipping-readiness';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import { openStripeConnectDashboard } from '../lib/openStripeConnectDashboard';
import {
  openStripeConnectOnboarding,
  refreshSellerConnectAfterOnboarding,
} from '../lib/openStripeConnectOnboarding';
import { areDevToolsEnabled } from '../lib/devTools';

function statusStyle(status: ListingPreview['status']) {
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
    case 'ended':
      return { bg: 'rgba(255,255,255,0.08)', fg: colors.textMuted, label: 'Ended' };
    default:
      return { bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted, label: status };
  }
}

export function SellerHubScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { user, loading: authLoading, session } = useAuth();
  const { userListings } = useCreateListingDraft();
  const sellerInventory = useSellerInventory(session?.access_token, Boolean(user?.id));
  const inventoryListingCount = sellerInventory.marketplace.length + sellerInventory.liveShow.length;
  const cmdData = useSellerCommandCenterData(
    session?.access_token,
    inventoryListingCount || userListings.length,
  );
  const sellerSetup = useSellerSetupState(session?.access_token, Boolean(user?.id));

  useEffect(() => {
    if (user?.id) void cmdData.reloadAnalytics(user.id);
  }, [user?.id, cmdData.reloadAnalytics]);
  const sellerConnect = cmdData.sellerConnect;
  const sellerWallet = cmdData.sellerWallet;
  const [tab, setTab] = useState<SellerHubTabId>('overview');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleCategory, setScheduleCategory] = useState('Other');
  const [streamFormat, setStreamFormat] = useState<'auction' | 'break' | 'hybrid'>('hybrid');
  const [preloadInventory, setPreloadInventory] = useState(true);
  const [giveaways, setGiveaways] = useState(true);
  const [stripeSetupBusy, setStripeSetupBusy] = useState(false);

  useEffect(() => {
    const pending = consumePendingSellerHQTab();
    if (pending) setTab(pending);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void sellerSetup.refetchSilent();
      void cmdData.liveReadiness.refresh();
    }, [sellerSetup.refetchSilent, cmdData.liveReadiness.refresh]),
  );

  const shipFromComplete = sellerHasShipFromAddress(sellerSetup.checks, sellerSetup.seller);
  const sellerActivated = sellerSetup.displayActivated;

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
      await openStripeConnectOnboarding(session.access_token);
      const latest = await refreshSellerConnectAfterOnboarding(sellerConnect.refresh);
      await cmdData.liveReadiness.refresh();
      if (isSellerPayoutSetupComplete(latest)) {
        Alert.alert('Payout setup complete', 'Your payout status is Complete. You are ready to sell and go live.');
      } else if (latest && sellerConnectBadge(latest, { fetchError: sellerConnect.statusError }) === 'Ready') {
        Alert.alert(
          'Payout setup received',
          'Stripe has your details. Status is Ready — tap Refresh status if it does not update to Complete yet.',
        );
      } else {
        Alert.alert(
          'Stripe payout setup',
          'If Stripe asked for more information, tap Connect payouts again. Otherwise refresh status in a minute.',
        );
      }
    } catch (e) {
      Alert.alert('Could not start payout setup', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setStripeSetupBusy(false);
    }
  }, [cmdData.liveReadiness, session?.access_token, sellerConnect, stripeSetupBusy]);

  const onLiveSetupBlocked = useCallback(() => {
    const gate = cmdData.liveGate;
    Alert.alert(gate.alertTitle, gate.alertBody);
    if (gate.nextStep === 'stripe') void openStripeOnboarding();
    else if (gate.nextStep === 'ship_from') setTab('overview');
    else setTab('live');
  }, [cmdData.liveGate, openStripeOnboarding]);

  const onSellerHQEntryPress = useCallback(
    (phase: SellerHQEntryPhase) => {
      if (phase === 'guest') {
        navigateAuthSignUp();
        return;
      }
      openSellerSetup();
    },
    [],
  );

  const onFabAction = useCallback(
    (id: FabActionId) => {
      const rootNav = navigation as unknown as NavigationProp<ParamListBase>;
      switch (id) {
        case 'vault_events':
          setTab('live');
          break;
        case 'listing':
          void openCreateListing(rootNav, { channel: 'marketplace' });
          break;
        case 'schedule':
          setPendingVaultEventSchedule(true);
          setTab('live');
          break;
        case 'inventory':
          setTab('listings');
          break;
      }
    },
    [cmdData.liveRoom, navigation],
  );

  const openProfileSettings = useCallback(() => {
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('Settings');
    }
  }, []);

  const vaultEventsPanelProps = {
    accessToken: session?.access_token,
    liveGate: cmdData.liveGate,
    readiness:
      cmdData.liveReadiness.readinessLoaded && !cmdData.liveReadiness.loading
        ? cmdData.liveReadiness.readiness
        : null,
    readinessLoading: cmdData.liveReadiness.loading,
    onRefreshReadiness: () => void cmdData.liveReadiness.refresh(),
    onFixReadiness: (step: 'stripe' | 'ship_from') => {
      if (step === 'stripe') void openStripeOnboarding();
      else if (step === 'ship_from') setTab('overview');
    },
    onBlockedSchedule: onLiveSetupBlocked,
    scheduleTitle,
    setScheduleTitle,
    scheduleCategory,
    setScheduleCategory,
    streamFormat,
    setStreamFormat,
    preloadInventory,
    setPreloadInventory,
    giveaways,
    setGiveaways,
    sellerDisplayName: sellerLaunchMeta.displayName,
    sellerHandle: sellerLaunchMeta.handle,
    sellerAvatarUrl: sellerLaunchMeta.avatar,
    vaultListingCount: userListings.length,
    mainTabBarClearance: mainTabBarClearance(insets.bottom),
    onBrowseLive: () => navigation.navigate('Live', { screen: 'LiveDiscovery' }),
    onHostRoom: (roomId: string) => openSellerHostRoom(navigation, roomId),
    onViewRecap: (roomId: string) => {
      const tabNav = navigation.getParent();
      const root = tabNav?.getParent?.() ?? tabNav;
      if (root && 'navigate' in root) {
        (root as { navigate: (n: string, p: { roomId: string }) => void }).navigate('VaultEventRecap', {
          roomId,
        });
      } else if (rootNavigationRef.isReady()) {
        rootNavigationRef.navigate('VaultEventRecap', { roomId });
      }
    },
  };

  const renderTab = () => {
    switch (tab) {
      case 'listings':
        return <ListingsPanel navigation={navigation} inventory={sellerInventory} />;
      case 'live':
        return null;
      case 'orders':
        return <OrdersPanel />;
      case 'wallet':
        return (
          <WalletPanel
            accessToken={session?.access_token}
            sellerWallet={sellerWallet}
            hasStripeAccount={Boolean(sellerConnect.status?.stripe_account_id?.trim())}
            onSetupPayouts={openStripeOnboarding}
          />
        );
      case 'analytics':
        return <AnalyticsPanel analytics={cmdData.analytics} />;
      case 'vault':
        return <VaultIdentityPanel />;
      default:
        return (
          <View style={{ gap: spacing.lg }}>
            <SellerHQCommandCenter
              data={cmdData}
              displayName={sellerLaunchMeta.displayName}
              handle={sellerLaunchMeta.handle}
              avatarUrl={sellerLaunchMeta.avatar}
              navigation={navigation}
              onOpenTab={setTab}
              onSellerHQEntryPress={onSellerHQEntryPress}
              onStripeSetup={openStripeOnboarding}
              stripeSetupBusy={stripeSetupBusy}
              onProfileSettings={openProfileSettings}
            />
            {(cmdData.liveReadiness.readinessLoaded || sellerSetup.seller) && !shipFromComplete ? (
              <SellerShipFromSetupCard
                accessToken={session?.access_token}
                onSaved={() => {
                  void sellerSetup.refetchSilent();
                  void cmdData.liveReadiness.refresh();
                }}
              />
            ) : null}
            <View style={styles.futureLane}>
              <Text style={styles.futureLaneEyebrow}>Coming to your lane</Text>
              <Text style={styles.futureLaneTitle}>AI assistant · moderation · live analytics</Text>
              <Text style={styles.futureLaneBody}>
                Creator subscriptions, vault verification, and collector reputation — reserved for your command center.
              </Text>
            </View>
            {areDevToolsEnabled() ? (
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
            ) : null}
            <VaultIdentityPanel compact />
          </View>
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
            Log in to unlock Seller HQ — revenue, fulfillment, collector network, and vault events.
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

  if (sellerSetup.showInitialLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, alignItems: 'center' }]}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  if (sellerSetup.showSetupGate) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.hqGateTitle}>Seller HQ</Text>
          <SellerSetupGatePanel phase={sellerSetup.phase} />
        </ScrollView>
        <AccountAccessBar variant="footer" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      {sellerActivated && tab !== 'live' && tab !== 'listings' ? (
        <SellerHQFab onAction={onFabAction} />
      ) : null}
      <SellerHubTabBar activeTab={tab} onChangeTab={setTab} />
      {tab === 'live' ? (
        <View style={[styles.liveTabPane, { paddingBottom: 0 }]}>
          <LaunchVaultEventPanel {...vaultEventsPanelProps} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            tab === 'listings' ? (
              <RefreshControl
                refreshing={sellerInventory.refreshing}
                onRefresh={() => void sellerInventory.refresh()}
                tintColor={colors.gold}
              />
            ) : undefined
          }
        >
          <View style={styles.tabBody}>{renderTab()}</View>
          <AccountAccessBar variant="footer" />
          <View style={{ height: spacing.lg }} />
        </ScrollView>
      )}
    </View>
  );
}

function ListingInventorySection({
  channel,
  navigation,
  listings,
  drafts,
  loading,
}: {
  channel: ListingChannel;
  navigation: BottomTabNavigationProp<MainTabParamList>;
  listings: ListingPreview[];
  drafts: { id: string }[];
  loading?: boolean;
}) {
  const cfg = LISTING_CHANNEL_CONFIG[channel];
  const isLive = channel === 'live_show';
  const hasListings = listings.length > 0;
  const sectionTitle = isLive ? 'Live show listings' : 'Marketplace listings';
  const headerLabel = `${sectionTitle} (${listings.length})`;

  const openNew = () => {
    void openCreateListing(navigation as unknown as NavigationProp<ParamListBase>, { channel });
  };

  return (
    <View
      style={[
        styles.listingSection,
        hasListings && styles.listingSectionCompact,
        { borderColor: cfg.border, backgroundColor: cfg.fill },
      ]}
    >
      <View style={[styles.listingsHeaderRow, hasListings && styles.listingsHeaderRowCompact]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.listingSectionTitleRow}>
            <Ionicons name={cfg.icon} size={hasListings ? 16 : 18} color={cfg.primary} />
            <Text style={[styles.listingsHeaderTitle, hasListings && styles.listingsHeaderTitleCompact]}>
              {headerLabel}
            </Text>
          </View>
          {!hasListings ? <Text style={styles.panelHint}>{cfg.helper}</Text> : null}
        </View>
        <Pressable style={[styles.listingsNewBtn, { backgroundColor: cfg.primary }]} onPress={openNew}>
          <Ionicons name="add" size={20} color="#0a0a0a" />
          <Text style={styles.listingsNewBtnText}>New</Text>
        </Pressable>
      </View>
      {loading && !hasListings ? (
        <ActivityIndicator color={cfg.primary} style={{ marginVertical: spacing.md }} />
      ) : null}
      {!loading && listings.length === 0 ? (
        <Text style={styles.listingSectionEmpty}>
          {isLive ? 'No show inventory yet — queue lots before you go live.' : 'No marketplace listings yet — start your storefront.'}
        </Text>
      ) : null}
      {hasListings ? (
        <View style={styles.listingGrid}>
        {listings.map((L) => {
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
                openSellerListingManagementFromTab(navigation, L.id);
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
                  {L.watches > 0 ? (
                    <Text style={styles.watchCount}>{L.watches} watching</Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
        </View>
      ) : null}
    </View>
  );
}

function ListingsPanel({
  navigation,
  inventory,
}: {
  navigation: BottomTabNavigationProp<MainTabParamList>;
  inventory: ReturnType<typeof useSellerInventory>;
}) {
  const { drafts } = useCreateListingDraft();

  return (
    <View style={{ gap: spacing.lg }}>
      <ListingInventorySection
        channel="marketplace"
        navigation={navigation}
        listings={inventory.marketplace}
        drafts={drafts}
        loading={inventory.loading}
      />
      <ListingInventorySection
        channel="live_show"
        navigation={navigation}
        listings={inventory.liveShow}
        drafts={drafts}
        loading={inventory.loading}
      />
    </View>
  );
}

function OrdersPanel() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<import('../api/ordersRepository').VaultOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      setLoading(true);
      const { fetchSellerOrders } = await import('../api/ordersRepository');
      setOrders(await fetchSellerOrders(user.id));
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) {
    return <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.lg }} />;
  }

  if (!orders.length) {
    return (
      <Text style={styles.orderEmpty}>
        No marketplace orders yet. When collectors buy from your vault, fulfillment appears here.
      </Text>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {orders.map((o) => {
        const amt = `$${(o.totalCents / 100).toFixed(2)}`;
        return (
          <Pressable
            key={o.id}
            style={styles.orderRow}
            onPress={() => openContactSupport({ category: 'order', referenceId: o.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.orderItem}>{o.listingTitle}</Text>
              <Text style={styles.orderBuyer}>
                {o.buyerUsername ? `@${o.buyerUsername}` : 'Buyer'} · {o.status}
              </Text>
            </View>
            <Text style={styles.orderAmt}>{amt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function WalletPanel({
  accessToken,
  sellerWallet,
  hasStripeAccount,
  onSetupPayouts,
}: {
  accessToken?: string;
  sellerWallet: {
    wallet: import('../api/stripeConnectRepository').SellerWalletSummary | null;
    loading: boolean;
    refresh: () => Promise<import('../api/stripeConnectRepository').SellerWalletSummary | null>;
  };
  hasStripeAccount: boolean;
  onSetupPayouts: () => void;
}) {
  const [stripeLinkBusy, setStripeLinkBusy] = useState(false);
  const w = sellerWallet.wallet;

  const available = sellerWallet.loading ? '…' : (w?.availableFormatted ?? walletSnapshot.available);
  const pending = sellerWallet.loading ? '…' : (w?.pendingFormatted ?? walletSnapshot.pending);
  const nextPayout =
    sellerWallet.loading ? '…' : (w?.nextPayoutLabel ?? (hasStripeAccount ? '—' : 'Set up payouts first'));
  const scheduleLine = w?.payoutScheduleSummary ?? w?.message ?? null;

  const openStripeSettings = async () => {
    if (!accessToken) return;
    if (!hasStripeAccount) {
      Alert.alert('Payout setup required', 'Connect Stripe before managing payouts.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Set up payouts', onPress: () => void onSetupPayouts() },
      ]);
      return;
    }
    setStripeLinkBusy(true);
    try {
      await openStripeConnectDashboard(accessToken);
    } catch (e) {
      Alert.alert('Could not open Stripe', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setStripeLinkBusy(false);
    }
  };

  return (
    <View style={styles.walletHero}>
      <View style={styles.walletHeaderRow}>
        <Text style={styles.walletLabel}>Revenue vault · available</Text>
        <Pressable onPress={() => void sellerWallet.refresh()} disabled={sellerWallet.loading} hitSlop={8}>
          <Text style={styles.walletRefresh}>{sellerWallet.loading ? 'Refreshing…' : 'Refresh'}</Text>
        </Pressable>
      </View>
      <Text style={styles.walletBig}>{available}</Text>
      <Text style={styles.walletHint}>Ready for Stripe’s next automatic payout (not instant withdraw).</Text>
      <View style={styles.walletRow}>
        <View style={styles.walletCol}>
          <Text style={styles.walletMuted}>Pending</Text>
          <Text style={styles.walletMid}>{pending}</Text>
          <Text style={styles.walletColHint}>Not yet available</Text>
        </View>
        <View style={styles.walletCol}>
          <Text style={styles.walletMuted}>Next payout</Text>
          <Text style={styles.walletMidSm} numberOfLines={4}>
            {nextPayout}
          </Text>
        </View>
      </View>
      {scheduleLine ? <Text style={styles.walletSchedule}>{scheduleLine}</Text> : null}
      {!hasStripeAccount ? (
        <Pressable style={styles.withdrawBtn} onPress={() => void onSetupPayouts()}>
          <Text style={styles.withdrawBtnText}>Set up payouts</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.walletStripeLink, stripeLinkBusy && styles.payoutCtaDisabled]}
          onPress={() => void openStripeSettings()}
          disabled={stripeLinkBusy}
        >
          {stripeLinkBusy ? (
            <ActivityIndicator color={colors.gold} />
          ) : (
            <Text style={styles.walletStripeLinkText}>Bank & payout settings in Stripe</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function AnalyticsPanel({ analytics }: { analytics: import('../api/sellerAnalyticsRepository').SellerAnalyticsSnapshot }) {
  const hasData =
    analytics.activeListings > 0 ||
    analytics.completedSales > 0 ||
    analytics.liveViewerTotal > 0 ||
    analytics.reviewCount > 0;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsBig}>{analytics.revenueAvailable ?? '—'}</Text>
        <Text style={styles.analyticsCaption}>Revenue vault · available balance</Text>
      </View>
      {hasData ? (
        <View style={styles.kpiGrid}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Active listings</Text>
            <Text style={styles.kpiVal}>{analytics.activeListings}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Completed sales</Text>
            <Text style={styles.kpiVal}>{analytics.completedSales}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Live viewers</Text>
            <Text style={styles.kpiVal}>{analytics.liveViewerTotal > 0 ? analytics.liveViewerTotal : '—'}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Vault rating</Text>
            <Text style={styles.kpiValSm}>
              {analytics.reviewCount > 0 ? `${analytics.averageRating.toFixed(1)}★ (${analytics.reviewCount})` : '—'}
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Completed trades</Text>
            <Text style={styles.kpiVal}>{analytics.completedTrades}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Followers</Text>
            <Text style={styles.kpiVal}>{analytics.followers}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.orderEmpty}>Insights populate as you list, sell, and host on Get Vaulted.</Text>
      )}
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
  hqScreenTitleRow: {
    marginBottom: spacing.xs,
  },
  hqScreenTitle: {
    ...typography.title,
    fontSize: 26,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  hqScreenSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
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
  liveTabPane: {
    flex: 1,
    marginTop: spacing.sm,
    minHeight: 0,
    overflow: 'hidden',
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
  listingSectionCompact: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  listingsHeaderRowCompact: {
    marginBottom: 0,
  },
  listingsHeaderTitleCompact: {
    fontSize: 17,
  },
  listingGrid: {
    gap: spacing.sm,
    marginTop: spacing.xs,
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
  payoutBadgeReady: {
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderColor: 'rgba(52,199,89,0.4)',
  },
  payoutBadgeTextReady: { color: colors.success },
  payoutCompleteRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  payoutCompleteText: { color: colors.success, fontSize: 14, fontWeight: '700', flex: 1 },
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
  payoutRefreshCta: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    minHeight: 48,
  },
  payoutRefreshCtaText: { color: colors.gold, fontWeight: '800', fontSize: 15 },
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
  orderEmpty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.md,
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
  walletHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletRefresh: { fontSize: 12, fontWeight: '700', color: colors.gold },
  walletLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    gap: spacing.md,
    marginTop: spacing.md,
  },
  walletCol: { flex: 1, minWidth: 0 },
  walletColHint: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  walletMidSm: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    lineHeight: 18,
  },
  walletSchedule: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: spacing.md,
  },
  walletStripeLink: {
    marginTop: spacing.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  walletStripeLinkText: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 14,
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
  walletHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: spacing.md,
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
  futureLane: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(212,175,55,0.04)',
    gap: spacing.xs,
  },
  futureLaneEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  futureLaneTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  futureLaneBody: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
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
