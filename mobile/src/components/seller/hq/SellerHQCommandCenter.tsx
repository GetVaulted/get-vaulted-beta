import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SellerHubTabId } from '../../../data/sellerHubMock';
import type { useSellerCommandCenterData } from '../../../hooks/useSellerCommandCenterData';
import type { SellerHQEntryPhase } from '../../../lib/sellerHubEntry';
import { openCreateListing } from '../../../navigation/openCreateListing';
import { openSellerHostRoom } from '../../../navigation/openSellerHostRoom';
import {
  isSellerPayoutSetupComplete,
  sellerConnectBadge,
  sellerConnectDetailMessage,
} from '../../../api/stripeConnectRepository';
import type { MainTabParamList } from '../../../navigation/types';
import { colors, radii, spacing } from '../../../theme';
import { SellerHQAnalyticsPreview } from './SellerHQAnalyticsPreview';
import { SellerHQCommandHeader } from './SellerHQCommandHeader';
import { SellerHQPremiumBanner } from './SellerHQPremiumBanner';
import { SellerHQQuickLaunch, type QuickLaunchId } from './SellerHQQuickLaunch';
import { SellerHQTodayInVault } from './SellerHQTodayInVault';
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
    switch (id) {
      case 'go_live':
        if (data.liveRoom) {
          openSellerHostRoom(navigation, data.liveRoom.id);
        } else {
          onOpenTab('live');
        }
        break;
      case 'schedule':
        onOpenTab('live');
        break;
      case 'listing':
        void openCreateListing(rootNav, { channel: 'marketplace' });
        break;
      case 'inventory':
        void openCreateListing(rootNav, { channel: 'live_show' });
        break;
    }
  };

  const onTodayItem = (id: string) => {
    if (id === 'countdown' || id === 'ship') onOpenTab('live');
    else if (id === 'drafts') onOpenTab('listings');
    else if (id === 'payout') onOpenTab('wallet');
    else onOpenTab('analytics');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.studioHeader}>
        <Text style={styles.studioTitle}>Seller Studio</Text>
        <Text style={styles.studioSub}>Command center · live commerce OS</Text>
      </View>

      <SellerHQPremiumBanner
        hasUser
        connect={status}
        connectLoading={data.sellerConnect.loading}
        setupProgress={data.setupProgress}
        onPress={onSellerHQEntryPress}
      />

      <SellerHQCommandHeader
        displayName={displayName}
        handle={handle}
        avatarUrl={avatarUrl}
        rankLabel={rankLabel}
        liveStatus={data.metrics.liveStatus}
        isLive={Boolean(data.liveRoom)}
        revenueSnapshot={data.metrics.revenueToday}
        followers={data.metrics.followers}
        pendingOrders={data.metrics.pendingOrders}
        upcomingShows={data.metrics.upcomingShows}
        onSettings={onProfileSettings}
      />

      {data.approved ? (
        <>
          <SellerHQQuickLaunch onAction={onQuickLaunch} />
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
        {(
          [
            { tab: 'live' as const, label: 'Vault events', icon: 'radio-outline' },
            { tab: 'listings' as const, label: 'Inventory queue', icon: 'layers-outline' },
            { tab: 'orders' as const, label: 'Fulfillment', icon: 'cube-outline' },
            { tab: 'wallet' as const, label: 'Revenue vault', icon: 'wallet-outline' },
          ] as const
        ).map((lane) => (
          <Pressable key={lane.tab} style={styles.laneChip} onPress={() => onOpenTab(lane.tab)}>
            <Ionicons name={lane.icon} size={16} color={colors.gold} />
            <Text style={styles.laneChipTxt}>{lane.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  studioHeader: { marginBottom: -spacing.sm },
  studioTitle: { fontSize: 28, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 },
  studioSub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
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
  laneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
});
