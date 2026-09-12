import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { SellerHubTabId } from '../../../data/sellerHubMock';
import type { useSellerCommandCenterData } from '../../../hooks/useSellerCommandCenterData';
import { resolveSellerHQEntryPhase, type SellerHQEntryPhase } from '../../../lib/sellerHubEntry';
import { computeSellerStudioReadinessProgress } from '../../../lib/sellerHubEntry';
import {
  sellerConnectBadge,
} from '../../../api/stripeConnectRepository';
import { openCreateListing } from '../../../navigation/openCreateListing';
import { setPendingVaultEventSchedule } from '../../../navigation/openSellerHQ';
import type { MainTabParamList } from '../../../navigation/types';
import { colors, spacing } from '../../../theme';
import { SellerHQCommandHeader } from './SellerHQCommandHeader';
import { SellerHQPerformanceKpiRow } from './SellerHQPerformanceKpiRow';
import { SellerHQPremiumBanner } from './SellerHQPremiumBanner';
import { SellerHQRevenuePaceCard } from './SellerHQRevenuePaceCard';
import { SellerHQSetupEssentials } from './SellerHQSetupEssentials';
import { SellerHQSpotlightCard } from './SellerHQSpotlightCard';
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
    resolveSellerHQEntryPhase({
      hasUser: true,
      connect: status,
      sellerActivated,
    }) !== 'ready';

  const setupProgress = computeSellerStudioReadinessProgress(status, { sellerActivated });

  return (
    <View style={styles.wrap}>
      <Text style={styles.studioSub}>Listings, live events, and fulfillment — one desk.</Text>

      {showSetupBanner ? (
        <SellerHQPremiumBanner
          hasUser
          connect={status}
          connectLoading={data.sellerConnect.loading && !data.sellerConnect.loadedOnce}
          setupProgress={setupProgress}
          sellerActivated={sellerActivated}
          onPress={onSellerHQEntryPress}
        />
      ) : null}

      <SellerHQCommandHeader displayName={displayName} handle={handle} avatarUrl={avatarUrl} rankLabel={rankLabel} />

      <SellerHQRevenuePaceCard analytics={data.analytics} />

      <SellerHQPerformanceKpiRow analytics={data.analytics} />

      <SellerHQSpotlightCard analytics={data.analytics} />

      {data.todayItems.length > 0 ? (
        <SellerHQTodayInVault items={data.todayItems} onPressItem={onTodayItem} />
      ) : null}

      <SellerHQStudioActions onAction={onStudioAction} />

      {data.liveCount > 0 || data.upcomingCount > 0 ? (
        <SellerHQVaultEventsStrip
          liveCount={data.liveCount}
          upcomingCount={data.upcomingCount}
          onOpenVaultEvents={() => onOpenTab('live')}
        />
      ) : null}

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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  studioSub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: -spacing.xs },
});
