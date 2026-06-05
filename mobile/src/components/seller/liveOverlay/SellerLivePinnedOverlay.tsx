import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';
import type { LiveRoomItemRow } from '../../../api/liveRoomControlRepository';
import { VaultPinnedLotCard } from '../liveConsole/VaultPinnedLotCard';

/** Active lot HUD above the next-up rail. */
export const SELLER_PINNED_OVERLAY_HEIGHT = 152;
export const SELLER_PINNED_EMPTY_HEIGHT = 56;
export const SELLER_PINNED_EMPTY_WITH_PIN_HEIGHT = 92;

export function SellerLivePinnedOverlay({
  bottom,
  left,
  right,
  item,
  serverNowMs,
  roomLive,
  busy,
  startingAuction,
  onStartBidding,
  onSold,
  onSkip,
  onExtend,
  onPinNext,
  pinNextLabel,
}: {
  bottom: number;
  left: number;
  right: number;
  item: LiveRoomItemRow | null;
  serverNowMs: number;
  roomLive: boolean;
  busy: boolean;
  startingAuction?: boolean;
  onStartBidding: () => void;
  onSold: () => void;
  onSkip: () => void;
  onExtend: () => void;
  onPinNext?: () => void;
  pinNextLabel?: string;
}) {
  return (
    <View style={[styles.host, { bottom, left, right }]} pointerEvents="box-none">
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
            item={item}
            serverNowMs={serverNowMs}
            roomLive={roomLive}
            busy={busy}
            startingAuction={startingAuction}
            onStartBidding={onStartBidding}
            onSold={onSold}
            onSkip={onSkip}
            onExtend={onExtend}
            onPinNext={onPinNext}
            pinNextLabel={pinNextLabel}
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
    padding: 6,
  },
});
