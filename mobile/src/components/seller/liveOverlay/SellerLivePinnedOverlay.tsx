import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { liveRoomHudScale } from '../../../lib/liveRoomUiScale';
import { VaultPinnedLotCard } from '../liveConsole/VaultPinnedLotCard';

/** Active lot HUD — single seller commerce box (initial estimate before onLayout). */
export const SELLER_PINNED_OVERLAY_HEIGHT = 96;
export const SELLER_PINNED_EMPTY_HEIGHT = 64;

export function SellerLivePinnedOverlay({
  bottom,
  left,
  right,
  item,
  serverNowMs,
  roomLive,
  broadcastOnAir,
  busy,
  startingAuction,
  onStartBidding,
  onSold,
  onSkip,
  onExtend,
  onEditSpots,
  onEditLot,
  hostOverlayMinimal = true,
  queuePreview = false,
  onLayoutHeight,
  clutchTimeEnabled,
  onToggleClutchTime,
}: {
  bottom: number;
  left: number;
  right: number;
  item: LiveRoomItemRow | null;
  serverNowMs: number;
  roomLive: boolean;
  broadcastOnAir?: boolean;
  busy: boolean;
  startingAuction?: boolean;
  onStartBidding: () => void;
  onSold: () => void;
  onSkip: () => void;
  onExtend: () => void;
  onEditSpots?: () => void;
  onEditLot?: () => void;
  hostOverlayMinimal?: boolean;
  queuePreview?: boolean;
  onLayoutHeight?: (height: number) => void;
  clutchTimeEnabled?: boolean;
  onToggleClutchTime?: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const hudScale = liveRoomHudScale(windowWidth);

  return (
    <View
      style={[styles.host, { bottom, left, right }]}
      pointerEvents="box-none"
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) onLayoutHeight?.(h);
      }}
    >
      <View style={styles.glass} pointerEvents="auto">
        {Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidGlass} />
        )}
        <LinearGradient
          colors={['rgba(212,175,55,0.1)', 'rgba(8,8,8,0.9)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.inner}>
          <VaultPinnedLotCard
            density="broadcast"
            hudScale={hudScale}
            item={item}
            serverNowMs={serverNowMs}
            roomLive={roomLive}
            broadcastOnAir={broadcastOnAir}
            busy={busy}
            startingAuction={startingAuction}
            onStartBidding={onStartBidding}
            onSold={onSold}
            onSkip={onSkip}
            onExtend={onExtend}
            hostOverlayMinimal={hostOverlayMinimal}
            queuePreview={queuePreview}
            onEditSpots={onEditSpots}
            onEditLot={onEditLot}
            clutchTimeEnabled={clutchTimeEnabled}
            onToggleClutchTime={onToggleClutchTime}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    zIndex: 14,
  },
  glass: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.38)',
    shadowColor: '#D4AF37',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  androidGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,11,9,0.9)',
  },
  inner: {
    padding: 4,
  },
});
