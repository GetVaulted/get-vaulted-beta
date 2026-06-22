import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { confirmStartLive } from '../../../lib/sellerBroadcastConfirm';
import { colors, radii, spacing } from '../../../theme';
import { SellerBroadcastControl } from './SellerBroadcastControl';
import { SellerCameraFlipButton } from './SellerCameraFlipButton';
import { SellerMicMuteButton } from './SellerMicMuteButton';

const ACTION_MIN_H = 44;

type Props = {
  top: number;
  onSales: () => void;
  salesAttentionCount?: number;
  onGiveaways: () => void;
  onObs: () => void;
  onTeams?: () => void;
  showTeamsBoard?: boolean;
  broadcastPhase: MobileHostBroadcastPhase;
  roomStatus: 'scheduled' | 'live' | 'ended';
  streamOnAir?: boolean;
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
  showMicMute?: boolean;
  micMuted?: boolean;
  micMuteDisabled?: boolean;
  onToggleMicMute?: () => void;
};

export function SellerConsoleActionBar({
  top,
  onSales,
  salesAttentionCount = 0,
  onGiveaways,
  onObs,
  onTeams,
  showTeamsBoard = false,
  broadcastPhase,
  roomStatus,
  streamOnAir = false,
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
  showMicMute,
  micMuted = false,
  micMuteDisabled,
  onToggleMicMute,
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
              style={[styles.actionBtn, salesAttentionCount > 0 && styles.salesAttentionBtn]}
              onPress={onSales}
              accessibilityLabel={SELLER_CONSOLE.sales}
              hitSlop={4}
            >
              <Ionicons name="receipt-outline" size={15} color="rgba(255,255,255,0.92)" />
              <Text style={styles.addTxt}>{SELLER_CONSOLE.sales}</Text>
              {salesAttentionCount > 0 ? (
                <View style={styles.attentionDot}>
                  <Text style={styles.attentionDotTxt}>{salesAttentionCount > 9 ? '9+' : salesAttentionCount}</Text>
                </View>
              ) : null}
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
            {showTeamsBoard && onTeams ? (
              <Pressable
                style={styles.actionBtn}
                onPress={onTeams}
                accessibilityLabel="View team board"
                hitSlop={4}
              >
                <Ionicons name="grid-outline" size={15} color="rgba(255,255,255,0.92)" />
                <Text style={styles.addTxt}>Teams</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.actionBtn}
              onPress={onObs}
              accessibilityLabel={SELLER_CONSOLE.obsSetup}
              hitSlop={4}
            >
              <Text style={styles.obsTxt}>{SELLER_CONSOLE.obsSetup}</Text>
            </Pressable>
            {typeof viewerCount === 'number' && streamOnAir ? (
              <View style={styles.viewersWrap}>
                <Text style={styles.viewers}>
                  {SELLER_CONSOLE.viewers} {viewerCount}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.trailing}>
            {showMicMute && onToggleMicMute ? (
              <SellerMicMuteButton
                visible
                muted={micMuted}
                disabled={micMuteDisabled}
                onPress={onToggleMicMute}
              />
            ) : null}
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
                roomStatus={roomStatus}
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
                onPress={() => confirmStartLive(onGoLive)}
                disabled={broadcastBusy}
                accessibilityLabel={SELLER_CONSOLE.startStream}
                hitSlop={4}
              >
                <Ionicons name="play" size={18} color="#0a0a0a" />
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
    backgroundColor: 'rgba(0,0,0,0.78)',
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
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  shareBtn: {
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  salesAttentionBtn: {
    borderColor: 'rgba(244,63,94,0.45)',
  },
  attentionDot: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,63,94,0.85)',
  },
  attentionDotTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
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
    minWidth: ACTION_MIN_H,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.55 },
});
