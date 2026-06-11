import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SellerHubTabId } from '../../../data/sellerHubMock';
import type { useSellerCommandCenterData } from '../../../hooks/useSellerCommandCenterData';
import type { SellerHQEntryPhase } from '../../../lib/sellerHubEntry';
import { openCreateListing } from '../../../navigation/openCreateListing';
import { openVaultComms } from '../../../navigation/openPlatform';
import { setPendingVaultEventSchedule } from '../../../navigation/openSellerHQ';
import { openWebCommerceUrl } from '../../../lib/openWebCommerce';
import { getWebApiBaseUrl } from '../../../lib/webApiBaseUrl';
import {
  isSellerPayoutSetupComplete,
  sellerConnectBadge,
  sellerConnectDetailMessage,
} from '../../../api/stripeConnectRepository';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../../../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;
import { colors, radii, spacing } from '../../../theme';
import { SellerHQAnalyticsPreview } from './SellerHQAnalyticsPreview';
import { SellerHQCommandHeader } from './SellerHQCommandHeader';
import { SellerHQPremiumBanner } from './SellerHQPremiumBanner';
import { SellerHQQuickLaunch, type QuickLaunchId } from './SellerHQQuickLaunch';
import { SellerHQTodayInVault } from './SellerHQTodayInVault';
import { SellerHQVaultEventsStrip } from './SellerHQVaultEventsStrip';
import { SellerHQLayawaysCard } from './SellerHQLayawaysCard';
import type { SellerLayawayCounts } from '../../../api/layawayRepository';
import { openSellerLayaways } from '../../../navigation/openSellerLayaways';
import { hq } from './hqStyles';

type CommandCenterData = ReturnType<typeof useSellerCommandCenterData>;

export function SellerHQCommandCenter({
  data,
  displayName,
  handle,
  avatarUrl,
  navigation,
  onOpenTab,
  onSellerHQEntryPress,
  onStripeSetup,
  stripeSetupBusy,
  onProfileSettings,
  layawayCounts,
  layawaysLoading,
  hasLayaways,
}: {
  data: CommandCenterData;
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  navigation: BottomTabNavigationProp<MainTabParamList>;
  onOpenTab: (tab: SellerHubTabId) => void;
  onSellerHQEntryPress: (phase: SellerHQEntryPhase) => void;
  onStripeSetup: () => void;
  stripeSetupBusy: boolean;
  onProfileSettings: () => void;
  layawayCounts: SellerLayawayCounts | null;
  layawaysLoading: boolean;
  hasLayaways: boolean;
}) {
  const rootNav = navigation as unknown as NavigationProp<ParamListBase>;
  const status = data.sellerConnect.status;
  const badge = sellerConnectBadge(status, { fetchError: data.sellerConnect.statusError });
  const payoutComplete = isSellerPayoutSetupComplete(status);

  const rankLabel = data.approved
    ? 'Vault Creator'
    : badge === 'Complete' || badge === 'Ready'
      ? 'Verified Seller'
      : 'Studio Initiate';

  const onQuickLaunch = (id: QuickLaunchId) => {
    if (id === 'schedule' && data.liveGate.blocked) {
      Alert.alert(data.liveGate.alertTitle, data.liveGate.alertBody);
      if (data.liveGate.nextStep === 'ship_from') onOpenTab('overview');
      else if (data.liveGate.nextStep === 'stripe') void onStripeSetup();
      return;
    }
    switch (id) {
      case 'schedule':
        setPendingVaultEventSchedule(true);
        onOpenTab('live');
        break;
      case 'vault_events':
        onOpenTab('live');
        break;
      case 'listing':
        void openCreateListing(rootNav, { channel: 'marketplace' });
        break;
      case 'inventory':
        onOpenTab('listings');
        break;
      case 'obs_studio': {
        const base = getWebApiBaseUrl();
        if (!base) {
          Alert.alert('OBS Studio', 'Set EXPO_PUBLIC_SITE_URL to open OBS Studio on web.');
          return;
        }
        void openWebCommerceUrl(`${base}/account/seller/obs`);
        break;
      }
    }
  };

  const onTodayItem = (id: string) => {
    if (id === 'vault_events') onOpenTab('live');
    else if (id === 'ship') onOpenTab('orders');
    else if (id === 'drafts') onOpenTab('listings');
    else if (id === 'payout') onOpenTab('wallet');
    else if (id === 'followers') openVaultComms(rootNav);
    else if (id === 'layaways' || id === 'layaways_ready') {
      openSellerLayaways(rootNav as unknown as RootNav, {
        filter: id === 'layaways_ready' ? 'ready' : 'active',
      });
    }
    else onOpenTab('analytics');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.studioHeader}>
        <Text style={styles.studioTitle}>Seller Studio</Text>
        <Text style={styles.studioSub}>Revenue · fulfillment · collectors · growth</Text>
        <Text style={styles.hierarchy}>Studio → Vault Events → Command Center</Text>
      </View>

      <SellerHQPremiumBanner
        hasUser
        connect={status}
        connectLoading={data.sellerConnect.loading && !data.sellerConnect.loadedOnce}
        setupProgress={data.setupProgress}
        onPress={onSellerHQEntryPress}
      />

      <SellerHQCommandHeader
        displayName={displayName}
        handle={handle}
        avatarUrl={avatarUrl}
        rankLabel={rankLabel}
        revenueSnapshot={data.metrics.revenueToday}
        activeCollectors={data.metrics.activeCollectors}
        pendingOrders={data.metrics.pendingOrders}
        performanceInsight={data.metrics.performanceInsight}
        onSettings={onProfileSettings}
      />

      <SellerHQLayawaysCard
        counts={layawayCounts}
        loading={layawaysLoading}
        hasLayaways={hasLayaways}
        onPress={() => openSellerLayaways(rootNav as unknown as RootNav)}
        onPressFilter={(filter) => openSellerLayaways(rootNav as unknown as RootNav, { filter })}
      />

      {data.approved ? (
        <>
          <SellerHQVaultEventsStrip
            liveCount={data.liveCount}
            upcomingCount={data.upcomingCount}
            onOpenVaultEvents={() => onOpenTab('live')}
          />
          <SellerHQQuickLaunch onAction={onQuickLaunch} />
          <Pressable
            style={({ pressed }) => [styles.inboxCard, pressed && { opacity: 0.92 }]}
            onPress={() => openVaultComms(rootNav)}
          >
            <Ionicons name="chatbubbles-outline" size={22} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inboxTitle}>Collector network</Text>
              <Text style={styles.inboxSub}>Inbox · offers · orders · message requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
          <SellerHQTodayInVault items={data.todayItems} onPressItem={onTodayItem} />
          <SellerHQAnalyticsPreview values={data.metrics} />
        </>
      ) : null}

      {!payoutComplete ? (
        <View style={[styles.payoutCard, hq.goldCard]}>
          <Text style={styles.payoutTitle}>Revenue vault setup</Text>
          <Text style={styles.payoutSub}>{sellerConnectDetailMessage(status, { fetchError: data.sellerConnect.statusError })}</Text>
          <Pressable
            style={[styles.payoutBtn, stripeSetupBusy && styles.disabled]}
            onPress={onStripeSetup}
            disabled={stripeSetupBusy}
          >
            {stripeSetupBusy ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text style={styles.payoutBtnTxt}>Connect payouts</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.laneRow}>
        <Text style={styles.laneEyebrow}>Business lanes</Text>
        <View style={styles.laneChips}>
          {(
            [
              { key: 'listings', tab: 'listings' as const, label: 'Inventory', icon: 'layers-outline' as const },
              { key: 'orders', tab: 'orders' as const, label: 'Fulfillment', icon: 'cube-outline' as const },
              ...(hasLayaways
                ? [{ key: 'layaways', label: 'Layaways', icon: 'time-outline' as const, layaways: true as const }]
                : []),
              { key: 'wallet', tab: 'wallet' as const, label: 'Revenue vault', icon: 'wallet-outline' as const },
              { key: 'analytics', tab: 'analytics' as const, label: 'Insights', icon: 'stats-chart-outline' as const },
              { key: 'live', tab: 'live' as const, label: 'Vault Events', icon: 'calendar-outline' as const },
            ] as const
          ).map((lane) => (
            <Pressable
              key={lane.key}
              style={styles.laneChip}
              onPress={() =>
                'layaways' in lane && lane.layaways
                  ? openSellerLayaways(rootNav as unknown as RootNav)
                  : onOpenTab(lane.tab)
              }
            >
              <Ionicons name={lane.icon} size={16} color={colors.gold} />
              <Text style={styles.laneChipTxt}>{lane.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  studioHeader: { marginBottom: -spacing.sm },
  studioTitle: { fontSize: 28, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 },
  studioSub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  hierarchy: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  payoutCard: { padding: spacing.md, gap: spacing.sm },
  payoutTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  payoutSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  payoutBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.gold,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  payoutBtnTxt: { fontWeight: '800', color: '#0a0a0a' },
  disabled: { opacity: 0.6 },
  laneRow: { gap: spacing.sm },
  laneEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  laneChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  laneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  laneChipTxt: { fontSize: 12, fontWeight: '700', color: colors.gold },
  inboxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.28)',
    backgroundColor: 'rgba(212,175,55,0.06)',
  },
  inboxTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  inboxSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
