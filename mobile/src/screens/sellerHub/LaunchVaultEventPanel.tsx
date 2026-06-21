import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { consumePendingVaultEventSchedule } from '../../navigation/openSellerHQ';
import type { SellerLiveReadiness } from '../../api/liveHostRepository';
import type { LiveSalesGate } from '../../lib/sellerLiveReadiness';
import { ScheduleVaultEventModal } from '../../components/seller/hq/ScheduleVaultEventModal';
import { VaultEventsHub } from '../../components/seller/hq/VaultEventsHub';
export type LaunchVaultEventPanelProps = {
  accessToken?: string;
  liveGate: LiveSalesGate;
  readiness: SellerLiveReadiness | null;
  readinessLoading: boolean;
  onRefreshReadiness?: () => void;
  onFixReadiness?: (step: 'stripe' | 'ship_from') => void;
  onBlockedSchedule?: () => void;
  scheduleTitle: string;
  setScheduleTitle: (s: string) => void;
  scheduleCategory: string;
  setScheduleCategory: (label: string) => void;
  streamFormat: 'auction' | 'break' | 'hybrid';
  setStreamFormat: (f: 'auction' | 'break' | 'hybrid') => void;
  preloadInventory: boolean;
  setPreloadInventory: (v: boolean) => void;
  giveaways: boolean;
  setGiveaways: (v: boolean) => void;
  onBrowseLive: () => void;
  onHostRoom: (roomId: string) => void;
  onViewRecap: (roomId: string) => void;
  sellerDisplayName: string;
  sellerHandle: string;
  sellerAvatarUrl?: string | null;
  vaultListingCount: number;
};

/** Vault Events tab — event management hub (not the per-show command center). */
export function LaunchVaultEventPanel(props: LaunchVaultEventPanelProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [roomsRefreshKey, setRoomsRefreshKey] = useState(0);

  useEffect(() => {
    if (consumePendingVaultEventSchedule()) setScheduleOpen(true);
  }, []);

  return (
    <View style={{ flex: 1, minHeight: 0, width: '100%' }}>
      <VaultEventsHub
        accessToken={props.accessToken}
        liveGate={props.liveGate}
        sellerAvatarUrl={props.sellerAvatarUrl}
        onHostRoom={props.onHostRoom}
        onViewRecap={props.onViewRecap}
        onScheduleNew={() => setScheduleOpen(true)}
        onBlockedSchedule={props.onBlockedSchedule}
        roomsRefreshKey={roomsRefreshKey}
      />
      <ScheduleVaultEventModal
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        accessToken={props.accessToken}
        liveGate={props.liveGate}
        readiness={props.readiness}
        readinessLoading={props.readinessLoading}
        onRefreshReadiness={props.onRefreshReadiness}
        onFixReadiness={props.onFixReadiness}
        scheduleTitle={props.scheduleTitle}
        setScheduleTitle={props.setScheduleTitle}
        scheduleCategory={props.scheduleCategory}
        setScheduleCategory={props.setScheduleCategory}
        streamFormat={props.streamFormat}
        setStreamFormat={props.setStreamFormat}
        onScheduled={() => setRoomsRefreshKey((k) => k + 1)}
        onCreated={(roomId) => props.onHostRoom(roomId)}
      />
    </View>
  );
}
