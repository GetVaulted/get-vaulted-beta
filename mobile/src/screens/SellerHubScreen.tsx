import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type SellerHubTabId,
  vaultWins,
} from '../data/sellerHubMock';
import { SellerHubTabBar } from '../components/seller/hq/SellerHubTabBar';
import { LaunchVaultEventPanel } from './sellerHub/LaunchVaultEventPanel';
import { SellerSetupGatePanel } from '../components/seller/hq/SellerSetupGatePanel';
import { useCreateListingDraft } from '../createListing/CreateListingDraftContext';
import { openContactSupport } from '../navigation/openPlatform';
import { openSellerSetup } from '../navigation/openSellerSetup';
import { AccountAccessBar } from '../components/account/AccountAccessBar';
import { SellerHQCommandCenter } from '../components/seller/hq/SellerHQCommandCenter';
import { SellerInventoryPanel } from '../components/seller/hq/SellerInventoryPanel';
import { SellerInsightsPanel } from '../components/seller/hq/SellerInsightsPanel';
import { SellerRevenuePanel } from '../components/seller/hq/SellerRevenuePanel';
import type { SellerHQEntryPhase } from '../lib/sellerHubEntry';
import { useSellerSetupState } from '../hooks/useSellerSetupState';
import { openSellerHostRoom } from '../navigation/openSellerHostRoom';
import { consumePendingSellerHQTab, setPendingVaultEventSchedule } from '../navigation/openSellerHQ';
import { navigateAuthLogin, navigateAuthSignUp, rootNavigationRef } from '../navigation/rootNavigationRef';
import { useAuth } from '../auth/AuthContext';
import { fetchProfileById } from '../api/profilesRepository';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, radii, spacing, typography } from '../theme';
import {
  isSellerPayoutSetupComplete,
  sellerConnectBadge,
  sellerConnectDetailMessage,
} from '../api/stripeConnectRepository';
import { useSellerCommandCenterData } from '../hooks/useSellerCommandCenterData';
import { useSellerInventory } from '../hooks/useSellerInventory';
import { useSellerLayawaySummary } from '../hooks/useSellerLayawaySummary';
import { useSellerOrdersSummary } from '../hooks/useSellerOrdersSummary';
import { useSellerLiveOrdersSummary } from '../hooks/useSellerLiveOrdersSummary';
import { useSellerHQSync } from '../hooks/useSellerCommerceSync';
import { useCanonicalUserId } from '../hooks/useCanonicalUserId';
import { openSellerLayaways } from '../navigation/openSellerLayaways';
import { SellerHQOrdersPanel } from '../components/seller/hq/SellerHQOrdersPanel';
import { getWebApiBaseUrl } from '../lib/webApiBaseUrl';
import {
  openStripeConnectOnboarding,
  refreshSellerConnectAfterOnboarding,
} from '../lib/openStripeConnectOnboarding';
import { areDevToolsEnabled } from '../lib/devTools';
import { useMarketplaceLayout } from '../hooks/useMarketplaceLayout';
import { deferAfterFirstPaint } from '../lib/deferAfterFirstPaint';

export function SellerHubScreen() {
  const insets = useSafeAreaInsets();
  const layout = useMarketplaceLayout();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { user, loading: authLoading, session } = useAuth();
  const { userListings } = useCreateListingDraft();
  const sellerInventory = useSellerInventory(session?.access_token, Boolean(user?.id));
  const inventoryListingCount = sellerInventory.marketplace.length + sellerInventory.liveShow.length;
  const layawaySummary = useSellerLayawaySummary(session?.access_token);
  const canonicalUserId = useCanonicalUserId(session?.access_token);
  const cmdData = useSellerCommandCenterData(
    session?.access_token,
    inventoryListingCount || userListings.length,
    layawaySummary.counts,
  );
  const ordersSummary = useSellerOrdersSummary(session?.access_token);
  const liveRoom = cmdData.liveRoom;
  const liveOrdersSummary = useSellerLiveOrdersSummary(session?.access_token, liveRoom?.id, {
    canonicalUserId,
    supabaseUserId: user?.id,
    enabled: Boolean(liveRoom?.id),
  });
  const sellerSetup = useSellerSetupState(session?.access_token, user?.id, Boolean(user?.id));
  const sellerConnect = cmdData.sellerConnect;
  const sellerWallet = cmdData.sellerWallet;

  useSellerHQSync({
    enabled: Boolean(session?.access_token && user?.id),
    canonicalUserId,
    supabaseUserId: user?.id,
    userId: user?.id,
    reloadOrders: ordersSummary.reload,
    reloadLayaways: layawaySummary.reload,
    reloadAnalytics: user?.id ? cmdData.reloadAnalytics : undefined,
    reloadRooms: cmdData.reloadRooms,
    reloadInventory: sellerInventory.reload,
    reloadWallet: sellerWallet.refresh,
    reloadConnect: sellerConnect.refresh,
    reloadLiveReadiness: cmdData.liveReadiness.refresh,
    reloadLiveOrders: liveRoom ? liveOrdersSummary.reload : undefined,
    pollIntervalMs: 60_000,
    refetchOnFocus: false,
  });

  useEffect(() => {
    if (!user?.id) return;
    const task = deferAfterFirstPaint(() => {
      void cmdData.reloadAnalytics(user.id);
    }, 1200);
    return () => task.cancel();
  }, [user?.id, cmdData.reloadAnalytics]);
  const [tab, setTab] = useState<SellerHubTabId>('overview');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleCategory, setScheduleCategory] = useState('Cards');
  const [streamFormat, setStreamFormat] = useState<'auction' | 'break' | 'hybrid'>('hybrid');
  const [preloadInventory, setPreloadInventory] = useState(true);
  const [giveaways, setGiveaways] = useState(true);
  const [stripeSetupBusy, setStripeSetupBusy] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [shipFromEditKey, setShipFromEditKey] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const studioSectionY = useRef(0);
  const setupInnerY = useRef(0);

  useEffect(() => {
    const pending = consumePendingSellerHQTab();
    if (pending) setTab(pending);
  }, []);

  const pullRefresh = useCallback(async (...tasks: Array<() => void | Promise<unknown>>) => {
    setPullRefreshing(true);
    try {
      await Promise.all(tasks.map((task) => task()));
    } finally {
      setPullRefreshing(false);
    }
  }, []);

  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setProfileAvatarUrl(null);
      return;
    }
    const task = deferAfterFirstPaint(() => {
      void fetchProfileById(user.id).then((p) => {
        setProfileAvatarUrl(p?.avatar_url?.trim() || null);
      });
    }, 400);
    return () => task.cancel();
  }, [user?.id]);

  const sellerActivated = sellerSetup.displayActivated;

  const focusShipFromSetup = useCallback(() => {
    setTab('overview');
    setShipFromEditKey((k) => k + 1);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, studioSectionY.current + setupInnerY.current - 12),
        animated: true,
      });
    });
  }, []);

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
    const avatar = profileAvatarUrl;
    return { displayName, handle, avatar };
  }, [user, profileAvatarUrl]);

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
    else if (gate.nextStep === 'ship_from') focusShipFromSetup();
    else setTab('live');
  }, [cmdData.liveGate, focusShipFromSetup, openStripeOnboarding]);

  const onSellerHQEntryPress = useCallback(
    (phase: SellerHQEntryPhase) => {
      if (phase === 'guest') {
        navigateAuthSignUp();
        return;
      }
      if (phase === 'ready') return;
      openSellerSetup();
    },
    [],
  );

  const onRefreshVaultEventReadiness = useCallback(() => {
    void cmdData.liveReadiness.refresh({ silent: true });
  }, [cmdData.liveReadiness]);

  const onFixVaultEventReadiness = useCallback(
    (step: 'stripe' | 'ship_from') => {
      if (step === 'stripe') void openStripeOnboarding();
      else if (step === 'ship_from') focusShipFromSetup();
    },
    [focusShipFromSetup, openStripeOnboarding],
  );

  const vaultEventsPanelProps = {
    accessToken: session?.access_token,
    liveGate: cmdData.liveGate,
    readiness: cmdData.liveReadiness.readiness,
    readinessLoading: cmdData.liveReadiness.loading && !cmdData.liveReadiness.loadedOnce,
    onRefreshReadiness: onRefreshVaultEventReadiness,
    onFixReadiness: onFixVaultEventReadiness,
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
        return <SellerInventoryPanel navigation={navigation} inventory={sellerInventory} />;
      case 'live':
        return null;
      case 'orders':
        return (
          <SellerHQOrdersPanel
            orders={ordersSummary.orders}
            ordersLoading={ordersSummary.loading}
            ordersLoadedOnce={ordersSummary.loadedOnce}
            liveOrders={liveOrdersSummary.orders}
            liveOrdersLoading={liveOrdersSummary.loading}
            liveOrdersLoadedOnce={liveOrdersSummary.loadedOnce}
            liveRoom={liveRoom}
            layawayCounts={layawaySummary.counts}
            layawaysLoading={layawaySummary.loading}
            layawaysLoadedOnce={layawaySummary.loadedOnce}
            hasLayaways={layawaySummary.hasLayaways}
            navigation={navigation as unknown as NativeStackNavigationProp<RootStackParamList>}
            onOpenLayaways={(filter) =>
              openSellerLayaways(navigation as unknown as NativeStackNavigationProp<RootStackParamList>, {
                filter,
              })
            }
          />
        );
      case 'wallet':
        return (
          <SellerRevenuePanel
            accessToken={session?.access_token}
            sellerWallet={sellerWallet}
            hasStripeAccount={Boolean(sellerConnect.status?.stripe_account_id?.trim())}
            onSetupPayouts={openStripeOnboarding}
            analytics={cmdData.analytics}
          />
        );
      case 'analytics':
        return (
          <SellerInsightsPanel
            analytics={cmdData.analytics}
            metrics={cmdData.metrics}
            inventory={sellerInventory}
            layawayCounts={layawaySummary.counts}
            liveCount={cmdData.liveCount}
            upcomingCount={cmdData.upcomingCount}
            onOpenTab={setTab}
          />
        );
      case 'vault':
        return <VaultIdentityPanel />;
      default:
        return (
          <View
            style={{ gap: spacing.lg }}
            onLayout={(e) => {
              studioSectionY.current = e.nativeEvent.layout.y;
            }}
          >
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
              sellerActivated={sellerActivated}
              accessToken={session?.access_token}
              shipFromEditKey={shipFromEditKey}
              onShipFromSaved={() => {
                void sellerSetup.refetchSilent();
                void cmdData.liveReadiness.refresh({ silent: true });
              }}
              onSetupSectionLayout={(y) => {
                setupInnerY.current = y;
              }}
            />
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
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: layout.tabBarClearance }]} showsVerticalScrollIndicator={false}>
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
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, alignItems: 'center', gap: spacing.md }]}>
        <ActivityIndicator color={colors.gold} size="large" />
        <Text style={styles.loadingHint}>Loading Seller HQ…</Text>
      </View>
    );
  }

  if (sellerSetup.showSetupGate) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: layout.tabBarClearance }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.hqGateTitle}>Seller HQ</Text>
          <SellerSetupGatePanel phase={sellerSetup.phase} />
        </ScrollView>
        <AccountAccessBar variant="footer" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: spacing.xs }]}>
      <SellerHubTabBar activeTab={tab} onChangeTab={setTab} />
      {tab === 'live' ? (
        <View style={[styles.liveTabPane, { paddingBottom: 0 }]}>
          <LaunchVaultEventPanel {...vaultEventsPanelProps} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.tabScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: layout.tabBarClearance }]}
          refreshControl={
            tab === 'listings' ? (
              <RefreshControl
                refreshing={pullRefreshing}
                onRefresh={() => void pullRefresh(() => sellerInventory.refresh())}
                tintColor={colors.gold}
              />
            ) : tab === 'orders' ? (
              <RefreshControl
                refreshing={pullRefreshing}
                onRefresh={() =>
                  void pullRefresh(
                    () => ordersSummary.reload({ silent: true }),
                    () => layawaySummary.reload({ silent: true }),
                    () => liveOrdersSummary.reload({ silent: true }),
                  )
                }
                tintColor={colors.gold}
              />
            ) : tab === 'wallet' ? (
              <RefreshControl
                refreshing={pullRefreshing}
                onRefresh={() => void pullRefresh(() => sellerWallet.refresh({ silent: true }))}
                tintColor={colors.gold}
              />
            ) : tab === 'analytics' ? (
              <RefreshControl
                refreshing={pullRefreshing}
                onRefresh={() =>
                  void pullRefresh(
                    () => sellerInventory.reload({ silent: true }),
                    () => ordersSummary.reload({ silent: true }),
                    () => layawaySummary.reload({ silent: true }),
                    () => cmdData.reloadRooms({ silent: true }),
                    () => (user?.id ? cmdData.reloadAnalytics(user.id) : undefined),
                  )
                }
                tintColor={colors.gold}
              />
            ) : tab === 'overview' ? (
              <RefreshControl
                refreshing={pullRefreshing}
                onRefresh={() =>
                  void pullRefresh(
                    () => ordersSummary.reload({ silent: true }),
                    () => layawaySummary.reload({ silent: true }),
                    () => sellerInventory.reload({ silent: true }),
                    () => sellerWallet.refresh({ silent: true }),
                    () => cmdData.reloadRooms({ silent: true }),
                    () => (user?.id ? cmdData.reloadAnalytics(user.id) : undefined),
                    () => sellerConnect.refresh({ silent: true }),
                    () => cmdData.liveReadiness.refresh({ silent: true }),
                  )
                }
                tintColor={colors.gold}
              />
            ) : undefined
          }
        >
          <View style={styles.tabBody}>{renderTab()}</View>
          <AccountAccessBar variant="footer" hideSettings />
          <View style={{ height: spacing.lg }} />
        </ScrollView>
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
  tabScroll: {
    flex: 1,
  },
  tabBody: {
    marginTop: spacing.lg,
  },
  loadingHint: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
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
  orderRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderLabelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  orderLabelBtnText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  orderTrackLink: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
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
