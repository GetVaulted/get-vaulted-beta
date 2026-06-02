import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii, spacing } from '../../../theme';
import { SellerBroadcastControl } from './SellerBroadcastControl';

type Props = {
  top: number;
  onShare: () => void;
  onAddItem: () => void;
  onObs: () => void;
  broadcastPhase: MobileHostBroadcastPhase;
  roomLive: boolean;
  canStartRoom: boolean;
  stageEnabled: boolean;
  cameraReady: boolean;
  broadcastBusy: boolean;
  onGoLive: () => void;
  onStopStream: () => void;
  viewerCount?: number;
};

export function SellerConsoleActionBar({
  top,
  onShare,
  onAddItem,
  onObs,
  broadcastPhase,
  roomLive,
  canStartRoom,
  stageEnabled,
  cameraReady,
  broadcastBusy,
  onGoLive,
  onStopStream,
  viewerCount,
}: Props) {
  return (
    <View style={[styles.host, { top }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidFill} />
        )}
        <View style={styles.row}>
          <Pressable style={styles.shareBtn} onPress={onShare} accessibilityLabel={SELLER_CONSOLE.shareShow}>
            <Ionicons name="share-outline" size={14} color={colors.gold} />
            <Text style={styles.shareTxt}>{SELLER_CONSOLE.shareShow}</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={onAddItem} accessibilityLabel={SELLER_CONSOLE.addItem}>
            <Ionicons name="add" size={16} color="rgba(255,255,255,0.92)" />
            <Text style={styles.addTxt}>{SELLER_CONSOLE.addItem}</Text>
          </Pressable>
          <Pressable style={styles.obsBtn} onPress={onObs} accessibilityLabel={SELLER_CONSOLE.obsSetup}>
            <Text style={styles.obsTxt}>{SELLER_CONSOLE.obsSetup}</Text>
          </Pressable>
          <View style={styles.spacer} />
          {typeof viewerCount === 'number' && roomLive ? (
            <Text style={styles.viewers}>
              {SELLER_CONSOLE.viewers} {viewerCount}
            </Text>
          ) : null}
          {stageEnabled ? (
            <SellerBroadcastControl
              phase={broadcastPhase}
              roomLive={roomLive}
              canStartRoom={canStartRoom}
              stageEnabled={stageEnabled}
              cameraReady={cameraReady}
              busy={broadcastBusy}
              onStart={onGoLive}
              onStop={onStopStream}
              compact
            />
          ) : canStartRoom ? (
            <Pressable
              style={[styles.goLive, broadcastBusy && styles.disabled]}
              onPress={onGoLive}
              disabled={broadcastBusy}
              accessibilityLabel={SELLER_CONSOLE.goLive}
            >
              <Text style={styles.goLiveTxt}>{SELLER_CONSOLE.goLive}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 13,
  },
  bar: {
    overflow: 'hidden',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  androidFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,8,0.82)',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  shareTxt: { fontSize: 11, fontWeight: '800', color: colors.gold },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addTxt: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.92)' },
  obsBtn: {
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  obsTxt: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.72)' },
  spacer: { flex: 1, minWidth: 4 },
  viewers: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.65)',
    fontVariant: ['tabular-nums'],
  },
  goLive: {
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  goLiveTxt: { fontSize: 11, fontWeight: '900', color: '#0a0a0a' },
  disabled: { opacity: 0.55 },
});
