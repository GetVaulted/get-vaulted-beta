import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { SellerHubTabId } from '../../../data/sellerHubMock';
import type { useSellerCommandCenterData } from '../../../hooks/useSellerCommandCenterData';
import { resolveSellerHQEntryPhase, type SellerHQEntryPhase } from '../../../lib/sellerHubEntry';
import {
  sellerConnectBadge,
} from '../../../api/stripeConnectRepository';
import { openCreateListing } from '../../../navigation/openCreateListing';
import { setPendingVaultEventSchedule } from '../../../navigation/openSellerHQ';
import type { MainTabParamList } from '../../../navigation/types';
import { colors, spacing } from '../../../theme';
import { SellerHQCommandHeader } from './SellerHQCommandHeader';
import { SellerHQPremiumBanner } from './SellerHQPremiumBanner';
import { SellerHQSetupEssentials } from './SellerHQSetupEssentials';
import { SellerHQStudioActions } from './SellerHQStudioActions';
import { SellerHQTodayInVault } from './SellerHQTodayInVault';
import { SellerHQVaultEventsStrip } from './SellerHQVaultEventsStrip';

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
  sellerActivated,
  accessToken,
  shipFromEditKey,
  onShipFromSaved,
  onSetupSectionLayout,
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
  sellerActivated: boolean;
  accessToken?: string;
  shipFromEditKey: number;
  onShipFromSaved?: () => void;
  onSetupSectionLayout?: (y: number) => void;
}) {
  const rootNav = navigation as unknown as NavigationProp<ParamListBase>;
  const status = data.sellerConnect.status;
  const connectBadge = sellerConnectBadge(status, { fetchError: data.sellerConnect.statusError });
  const rankLabel = data.approved
    ? 'Vault Creator'
    : connectBadge === 'Complete' || connectBadge === 'Ready'
      ? 'Verified Seller'
      : 'Studio Initiate';

  const onStudioAction = (id: 'listing' | 'events' | 'fulfillment') => {
    if (id === 'listing') {
      void openCreateListing(rootNav, { channel: 'marketplace' });
      return;
    }
    if (id === 'events') {
      if (data.liveGate.blocked) {
        Alert.alert(data.liveGate.alertTitle, data.liveGate.alertBody);
        if (data.liveGate.nextStep === 'ship_from') onOpenTab('overview');
        else if (data.liveGate.nextStep === 'stripe') void onStripeSetup();
        return;
      }
      setPendingVaultEventSchedule(true);
      onOpenTab('live');
      return;
    }
    onOpenTab('orders');
  };

  const onTodayItem = (id: string) => {
    if (id === 'vault_events') onOpenTab('live');
    else if (id === 'ship') onOpenTab('orders');
    else if (id === 'drafts') onOpenTab('listings');
    else if (id === 'payout') onOpenTab('wallet');
    else if (id === 'layaways' || id === 'layaways_ready') onOpenTab('orders');
    else onOpenTab('analytics');
  };

  const showSetupBanner =
    !sellerActivated &&
    resolveSellerHQEntryPhase({ hasUser: true, connect: status }) !== 'ready';

  return (
    <View style={styles.wrap}>
      <View style={styles.studioHeader}>
        <Text style={styles.studioTitle}>Seller Studio</Text>
        <Text style={styles.studioSub}>Your operating desk for listings, events, and fulfillment.</Text>
      </View>

      {showSetupBanner ? (
        <SellerHQPremiumBanner
          hasUser
          connect={status}
          connectLoading={data.sellerConnect.loading && !data.sellerConnect.loadedOnce}
          setupProgress={data.setupProgress}
          onPress={onSellerHQEntryPress}
        />
      ) : null}

      <SellerHQCommandHeader
        displayName={displayName}
        handle={handle}
        avatarUrl={avatarUrl}
        rankLabel={rankLabel}
        revenueSnapshot={data.metrics.revenueToday}
        activeCollectors={data.metrics.activeCollectors}
        pendingOrders={data.metrics.pendingOrders}
        performanceInsight={data.metrics.performanceInsight}
      />

      <SellerHQStudioActions onAction={onStudioAction} />

      <View onLayout={(e) => onSetupSectionLayout?.(e.nativeEvent.layout.y)}>
        <SellerHQSetupEssentials
          accessToken={accessToken}
          connectStatus={status}
          connectLoading={data.sellerConnect.loading && !data.sellerConnect.loadedOnce}
          connectError={data.sellerConnect.statusError}
          stripeSetupBusy={stripeSetupBusy}
          onStripeSetup={onStripeSetup}
          onShipFromSaved={onShipFromSaved}
          forceShipFromEditKey={shipFromEditKey}
        />
      </View>

      {data.liveCount > 0 || data.upcomingCount > 0 ? (
        <SellerHQVaultEventsStrip
          liveCount={data.liveCount}
          upcomingCount={data.upcomingCount}
          onOpenVaultEvents={() => onOpenTab('live')}
        />
      ) : null}

      {data.todayItems.length > 0 ? (
        <SellerHQTodayInVault items={data.todayItems} onPressItem={onTodayItem} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  studioHeader: { marginBottom: -spacing.xs },
  studioTitle: { fontSize: 28, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.5 },
  studioSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
});
