import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { confirmStartLive } from '../../../lib/sellerBroadcastConfirm';
import { GIVVY_UI } from '../../../lib/givvyUi';
import { sellerConsoleToolbarScale } from '../../../lib/liveRoomUiScale';
import { colors, radii, spacing } from '../../../theme';
import { SellerBroadcastControl } from './SellerBroadcastControl';
import { SellerCameraFlipButton } from './SellerCameraFlipButton';
import { SellerMicMuteButton } from './SellerMicMuteButton';

/** Identity row + toolbar row under safe area (matches SellerLiveOverlayHeader). */
export const SELLER_HEADER_IDENTITY_H = 40;
export const SELLER_HEADER_TOOLBAR_H = 32;
export const SELLER_HEADER_TOOLBAR_GAP = 4;
export const SELLER_HEADER_PADDING_TOP = 6;

export function sellerHeaderBlockHeight(layoutWidth?: number): number {
  const scale = layoutWidth != null ? sellerConsoleToolbarScale(layoutWidth) : 1;
  return SELLER_HEADER_IDENTITY_H + SELLER_HEADER_TOOLBAR_GAP + Math.round(SELLER_HEADER_TOOLBAR_H * scale);
}

const ACTION_MIN_H = 32;
const PILL_ICON = 11;
const PILL_LABEL = 9;
const TRAILING_BTN = 32;

type Props = {
  top?: number;
  /** Renders inside the header chrome — no separate floating bar. */
  embedded?: boolean;
  onSales: () => void;
  onGivvy?: () => void;
  salesAttentionCount?: number;
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
  embedded = false,
  onSales,
  onGivvy,
  salesAttentionCount = 0,
  onObs,
  onTeams,
  showTeamsBoard = false,
  broadcastPhase,
  roomStatus,
  canStartRoom,
  stageEnabled,
  cameraReady,
  broadcastBusy,
  onGoLive,
  onStopStream,
  showCameraFlip,
  cameraFlipDisabled,
  onFlipCamera,
  showMicMute,
  micMuted = false,
  micMuteDisabled,
  onToggleMicMute,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const scale = sellerConsoleToolbarScale(windowWidth);
  const pillIcon = Math.round(PILL_ICON * scale);
  const pillLabelSize = PILL_LABEL * scale;
  const pillLineHeight = Math.round(11 * scale);
  const actionMinH = Math.round(ACTION_MIN_H * scale);
  const actionPadH = Math.round(8 * scale);
  const actionPadV = Math.round(5 * scale);
  const actionGap = Math.round(4 * scale);
  const rowPadV = Math.round(4 * scale);
  const trailingBtn = Math.round(TRAILING_BTN * scale);
  const goLiveIcon = Math.round(15 * scale);

  const body = (
    <View style={[styles.bar, embedded && styles.barEmbedded]}>
      {embedded ? null : Platform.OS === 'ios' ? (
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.androidFill} />
      )}
      <View style={[styles.row, embedded && styles.rowEmbedded, { paddingVertical: embedded ? Math.round(2 * scale) : rowPadV, gap: actionGap }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces
          style={styles.actionsScroll}
          contentContainerStyle={[styles.actionsContent, { gap: actionGap }]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={[
              styles.actionBtn,
              {
                minHeight: actionMinH,
                paddingHorizontal: actionPadH,
                paddingVertical: actionPadV,
                gap: Math.round(3 * scale),
              },
              salesAttentionCount > 0 && styles.salesAttentionBtn,
            ]}
            onPress={onSales}
            accessibilityLabel={SELLER_CONSOLE.sales}
            hitSlop={Math.round(4 * scale)}
          >
            <Ionicons name="receipt-outline" size={pillIcon} color="rgba(255,255,255,0.92)" />
            <Text style={[styles.pillTxt, { fontSize: pillLabelSize, lineHeight: pillLineHeight }]}>
              {SELLER_CONSOLE.sales}
            </Text>
            {salesAttentionCount > 0 ? (
              <View
                style={[
                  styles.attentionDot,
                  {
                    minWidth: Math.round(14 * scale),
                    height: Math.round(14 * scale),
                    borderRadius: Math.round(7 * scale),
                  },
                ]}
              >
                <Text style={[styles.attentionDotTxt, { fontSize: Math.max(8, Math.round(8 * scale)) }]}>
                  {salesAttentionCount > 9 ? '9+' : salesAttentionCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          {onGivvy ? (
            <Pressable
              style={[
                styles.actionBtn,
                styles.givvyBtn,
                {
                  minHeight: actionMinH,
                  paddingHorizontal: actionPadH,
                  paddingVertical: actionPadV,
                  gap: Math.round(3 * scale),
                },
              ]}
              onPress={onGivvy}
              accessibilityLabel="Giveaways"
              hitSlop={Math.round(4 * scale)}
            >
              <Ionicons name="gift-outline" size={pillIcon} color={GIVVY_UI.icon} />
              <Text style={[styles.pillTxt, styles.givvyTxt, { fontSize: pillLabelSize, lineHeight: pillLineHeight }]}>
                Givvys
              </Text>
            </Pressable>
          ) : null}
          {showTeamsBoard && onTeams ? (
            <Pressable
              style={[
                styles.actionBtn,
                {
                  minHeight: actionMinH,
                  paddingHorizontal: actionPadH,
                  paddingVertical: actionPadV,
                  gap: Math.round(3 * scale),
                },
              ]}
              onPress={onTeams}
              accessibilityLabel="View team board"
              hitSlop={Math.round(4 * scale)}
            >
              <Ionicons name="grid-outline" size={pillIcon} color="rgba(255,255,255,0.92)" />
              <Text style={[styles.pillTxt, { fontSize: pillLabelSize, lineHeight: pillLineHeight }]}>Teams</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[
              styles.actionBtn,
              {
                minHeight: actionMinH,
                paddingHorizontal: actionPadH,
                paddingVertical: actionPadV,
              },
            ]}
            onPress={onObs}
            accessibilityLabel={SELLER_CONSOLE.obsSetup}
            hitSlop={Math.round(4 * scale)}
          >
            <Text style={[styles.pillTxt, { fontSize: pillLabelSize, lineHeight: pillLineHeight }]}>RTMP</Text>
          </Pressable>
        </ScrollView>

        <View style={[styles.trailing, { gap: actionGap }]}>
          {showMicMute && onToggleMicMute ? (
            <SellerMicMuteButton
              visible
              compact
              muted={micMuted}
              disabled={micMuteDisabled}
              onPress={onToggleMicMute}
            />
          ) : null}
          {showCameraFlip && onFlipCamera ? (
            <SellerCameraFlipButton
              visible
              compact
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
              headerCompact
            />
          ) : canStartRoom ? (
            <Pressable
              style={[
                styles.goLive,
                { width: trailingBtn, height: trailingBtn },
                broadcastBusy && styles.disabled,
              ]}
              onPress={() => confirmStartLive(onGoLive)}
              disabled={broadcastBusy}
              accessibilityLabel={SELLER_CONSOLE.startStream}
              hitSlop={Math.round(4 * scale)}
            >
              <Ionicons name="play" size={goLiveIcon} color="#0a0a0a" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  if (embedded) return body;

  return (
    <View style={[styles.host, top != null ? { top } : null]} pointerEvents="box-none">
      {body}
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
  barEmbedded: {
    borderRadius: radii.lg,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  androidFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 6,
    gap: 4,
  },
  rowEmbedded: {
    paddingVertical: 2,
    paddingLeft: 0,
    paddingRight: 0,
  },
  actionsScroll: {
    flex: 1,
    flexShrink: 1,
  },
  actionsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
    minHeight: ACTION_MIN_H,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  salesAttentionBtn: {
    borderColor: 'rgba(244,63,94,0.45)',
  },
  givvyBtn: {
    borderColor: GIVVY_UI.border,
    backgroundColor: GIVVY_UI.pillBg,
  },
  givvyTxt: {
    color: GIVVY_UI.label,
  },
  attentionDot: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,63,94,0.85)',
  },
  attentionDotTxt: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
  },
  pillTxt: {
    fontSize: PILL_LABEL,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 11,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    paddingLeft: 2,
  },
  goLive: {
    width: TRAILING_BTN,
    height: TRAILING_BTN,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  disabled: { opacity: 0.55 },
});
