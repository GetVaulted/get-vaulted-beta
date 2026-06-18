import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii, spacing } from '../../../theme';
import { SellerBroadcastControl } from './SellerBroadcastControl';
import { SellerCameraFlipButton } from './SellerCameraFlipButton';

const ACTION_MIN_H = 44;

type Props = {
  top: number;
  onShare: () => void;
  onAddItem: () => void;
  onGiveaways: () => void;
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
  showCameraFlip?: boolean;
  cameraFlipDisabled?: boolean;
  onFlipCamera?: () => void;
};

export function SellerConsoleActionBar({
  top,
  onShare,
  onAddItem,
  onGiveaways,
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
  showCameraFlip,
  cameraFlipDisabled,
  onFlipCamera,
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces
            style={styles.actionsScroll}
            contentContainerStyle={styles.actionsContent}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              style={[styles.actionBtn, styles.shareBtn]}
              onPress={onShare}
              accessibilityLabel={SELLER_CONSOLE.shareShow}
              hitSlop={4}
            >
              <Ionicons name="share-outline" size={14} color={colors.gold} />
              <Text style={styles.shareTxt}>{SELLER_CONSOLE.shareShow}</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={onAddItem}
              accessibilityLabel={SELLER_CONSOLE.addItem}
              hitSlop={4}
            >
              <Ionicons name="add" size={16} color="rgba(255,255,255,0.92)" />
              <Text style={styles.addTxt}>{SELLER_CONSOLE.addItem}</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={onGiveaways}
              accessibilityLabel="Giveaways"
              hitSlop={4}
            >
              <Ionicons name="gift-outline" size={15} color="rgba(255,255,255,0.92)" />
              <Text style={styles.addTxt}>Givvys</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={onObs}
              accessibilityLabel={SELLER_CONSOLE.obsSetup}
              hitSlop={4}
            >
              <Text style={styles.obsTxt}>{SELLER_CONSOLE.obsSetup}</Text>
            </Pressable>
            {typeof viewerCount === 'number' && roomLive ? (
              <View style={styles.viewersWrap}>
                <Text style={styles.viewers}>
                  {SELLER_CONSOLE.viewers} {viewerCount}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.trailing}>
            {showCameraFlip && onFlipCamera ? (
              <SellerCameraFlipButton
                visible
                disabled={cameraFlipDisabled}
                onPress={onFlipCamera}
              />
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
                hitSlop={4}
              >
                <Text style={styles.goLiveTxt}>{SELLER_CONSOLE.goLive}</Text>
              </Pressable>
            ) : null}
          </View>
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
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 8,
    gap: 6,
  },
  actionsScroll: {
    flex: 1,
    flexShrink: 1,
  },
  actionsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: ACTION_MIN_H,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  shareBtn: {
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: 'rgba(212,175,55,0.12)',
  },
  shareTxt: { fontSize: 11, fontWeight: '800', color: colors.gold },
  addTxt: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.92)' },
  obsTxt: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.72)' },
  viewersWrap: {
    minHeight: ACTION_MIN_H,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  viewers: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.65)',
    fontVariant: ['tabular-nums'],
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    paddingLeft: 2,
  },
  goLive: {
    minHeight: ACTION_MIN_H,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  goLiveTxt: { fontSize: 11, fontWeight: '900', color: '#0a0a0a' },
  disabled: { opacity: 0.55 },
});
