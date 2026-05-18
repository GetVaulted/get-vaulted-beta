import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { consumePendingVaultEventSchedule } from '../../navigation/openSellerHQ';
import type { SellerConnectStatusResponse } from '../../api/stripeConnectRepository';
import { ScheduleVaultEventModal } from '../../components/seller/hq/ScheduleVaultEventModal';
import { VaultEventsHub } from '../../components/seller/hq/VaultEventsHub';
export type LaunchVaultEventPanelProps = {
  accessToken?: string;
  sellerConnect: { status: SellerConnectStatusResponse | null; loading: boolean };
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
    <View>
      <VaultEventsHub
        accessToken={props.accessToken}
        sellerConnect={props.sellerConnect}
        sellerAvatarUrl={props.sellerAvatarUrl}
        onHostRoom={props.onHostRoom}
        onViewRecap={props.onViewRecap}
        onScheduleNew={() => setScheduleOpen(true)}
        roomsRefreshKey={roomsRefreshKey}
      />
      <ScheduleVaultEventModal
        visible={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        accessToken={props.accessToken}
        sellerConnect={props.sellerConnect}
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
