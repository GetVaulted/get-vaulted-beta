import { Ionicons } from '@expo/vector-icons';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSellerLiveConsole } from '../../hooks/useSellerLiveConsole';
import { AddInventoryModal } from '../../components/seller/liveConsole/AddInventoryModal';
import { EditBreakSpotsModal } from '../../components/seller/liveConsole/EditBreakSpotsModal';
import { EditQueueItemPricingModal } from '../../components/seller/liveConsole/EditQueueItemPricingModal';
import { liveConsoleStyles } from '../../components/seller/liveConsole/liveConsoleTheme';
import { LiveConsoleWarningBanner } from '../../components/seller/liveConsole/LiveConsoleWarningBanner';
import { VaultPinnedLotCard } from '../../components/seller/liveConsole/VaultPinnedLotCard';
import { VaultQueueList } from '../../components/seller/liveConsole/VaultQueueList';
import { colors, radii, spacing } from '../../theme';

/** @deprecated Dock UI — seller host uses fullscreen overlays. Kept for embedded tooling if needed. */
export function SellerLiveConsolePanel({
  accessToken,
  roomId,
  roomStatus,
  roomType,
  navigation,
  onOpenStreamTools,
  onBiddingUrgentChange,
}: {
  accessToken: string;
  roomId: string;
  roomStatus: 'scheduled' | 'live' | 'ended';
  roomType: 'auction' | 'sale' | 'break';
  navigation: NavigationProp<ParamListBase>;
  onOpenStreamTools?: () => void;
  onBiddingUrgentChange?: (urgent: boolean) => void;
}) {
  const c = useSellerLiveConsole({
    accessToken,
    roomId,
    roomStatus,
    roomType,
    navigation,
    onBiddingUrgentChange,
  });

  const queueHeader = (
    <View style={styles.queueHeader}>
      {c.consoleError ? (
        <LiveConsoleWarningBanner error={c.consoleError} onRetry={() => void c.loadOnce()} retrying={c.loading} />
      ) : null}
      {c.loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.md }} />
      ) : (
        <VaultPinnedLotCard
          item={c.activeItem}
          serverNowMs={c.serverNowMs}
          roomLive={c.roomLive}
          broadcastOnAir={c.broadcastOnAir}
          busy={c.busy}
          startingAuction={c.startingAuction}
          onStartBidding={c.onStartBidding}
          onSold={c.onSold}
          onSkip={c.onSkip}
          onExtend={c.onExtend}
          clutchTimeEnabled={c.hostClutchTimeEnabled}
          onToggleClutchTime={c.toggleHostClutchTime}
          auctionDurationSec={c.hostAuctionDurationSec}
          onAuctionDurationChange={c.setHostAuctionDurationSec}
        />
      )}
    </View>
  );

  return (
    <View style={liveConsoleStyles.dockShell}>
      <View style={liveConsoleStyles.dockHandle} />
      <View style={styles.dockHead}>
        <Text style={styles.dockTitle}>Vault control</Text>
        <Pressable onPress={() => void c.loadOnce()} hitSlop={8} disabled={c.loading || c.busy}>
          <Text style={styles.sync}>{c.loading ? '…' : 'Sync'}</Text>
        </Pressable>
      </View>
      <View style={styles.body}>
        {!c.loading ? (
          <VaultQueueList
            scrollContainer
            items={c.items}
            roomType={roomType}
            roomEnded={c.roomEnded}
            roomLive={c.roomLive}
            busy={c.busy}
            onPin={c.onLaunch}
            onRemove={c.onRemove}
            onReorder={c.onReorder}
            onEditPricing={(item) => c.openPricingEditor(item)}
            listHeaderComponent={queueHeader}
            contentContainerStyle={styles.queueListContent}
          />
        ) : (
          queueHeader
        )}
      </View>
      {!c.roomEnded ? (
        <Pressable style={styles.addFab} onPress={() => c.setInventoryOpen(true)}>
          <Ionicons name="add" size={22} color="#0a0a0a" />
          <Text style={styles.addFabTxt}>Add inventory</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.signalLink} onPress={onOpenStreamTools}>
        <Text style={styles.signalLinkTxt}>Broadcast settings</Text>
      </Pressable>
      <AddInventoryModal
        visible={c.inventoryOpen}
        accessToken={accessToken}
        roomId={roomId}
        onClose={() => c.setInventoryOpen(false)}
        onSubmit={c.onQuickAddLot}
        busy={c.busy}
      />
      <EditQueueItemPricingModal
        item={c.pricingEditIsBreak ? null : c.pricingEditItem}
        busy={c.busy}
        onClose={() => c.setPricingEditItem(null)}
        onSave={c.onSaveQueuePricing}
      />
      <EditBreakSpotsModal
        item={c.pricingEditIsBreak ? c.pricingEditItem : null}
        busy={c.busy}
        onClose={() => c.setPricingEditItem(null)}
        onSave={c.onSaveBreakSpots}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: 2,
  },
  dockTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  sync: { fontSize: 12, fontWeight: '700', color: colors.gold },
  body: { flex: 1, minHeight: 0, paddingHorizontal: spacing.md },
  queueHeader: { gap: spacing.sm, paddingBottom: spacing.sm },
  queueListContent: { paddingBottom: 56, gap: spacing.sm },
  addFab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  addFabTxt: { fontWeight: '900', fontSize: 13, color: '#0a0a0a' },
  signalLink: { alignItems: 'center', paddingVertical: 6 },
  signalLinkTxt: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
});
