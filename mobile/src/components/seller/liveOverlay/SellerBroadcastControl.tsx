import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
import { confirmEndLive, confirmStartLive } from '../../../lib/sellerBroadcastConfirm';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii } from '../../../theme';

type Props = {
  phase: MobileHostBroadcastPhase;
  roomStatus: 'scheduled' | 'live' | 'ended';
  stageEnabled: boolean;
  cameraReady: boolean;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause?: () => void;
  onResume?: () => void;
  compact?: boolean;
  /** Smaller play/stop for the header toolbar row. */
  headerCompact?: boolean;
};

/** Play/stop with optional pause — pause appears only after the seller goes live. */
export function SellerBroadcastControl({
  phase,
  roomStatus,
  stageEnabled,
  cameraReady,
  busy,
  onStart,
  onStop,
  onPause,
  onResume,
  compact,
  headerCompact,
}: Props) {
  if (!stageEnabled) return null;

  const stopping = phase === 'stopping';
  const roomEnded = roomStatus === 'ended';
  const isOnAir = phase === 'live' || phase === 'paused' || stopping;
  const canShow = cameraReady || isOnAir;
  if (!canShow || roomEnded) return null;

  const showStop = isOnAir;
  const showPause = showStop && phase === 'live' && Boolean(onPause);
  const showResume = showStop && phase === 'paused' && Boolean(onResume);
  const starting = busy && (phase === 'idle' || phase === 'starting');
  const iconSize = headerCompact ? 15 : compact ? 18 : 20;
  const btnSize = headerCompact ? 32 : compact ? 44 : 48;

  const onPrimaryPress = () => {
    if (showStop) {
      if (stopping || busy) return;
      confirmEndLive(onStop);
      return;
    }
    if (!cameraReady || busy || stopping) return;
    confirmStartLive(onStart);
  };

  const primaryDisabled = stopping || (showStop ? busy : !cameraReady || busy);

  return (
    <View style={styles.row}>
      {showPause ? (
        <Pressable
          style={[
            styles.pause,
            { width: btnSize, height: btnSize },
            (stopping || busy) && styles.disabled,
          ]}
          onPress={onPause}
          disabled={stopping || busy}
          accessibilityLabel={SELLER_CONSOLE.pauseStream}
        >
          <Ionicons name="pause" size={iconSize} color="#fde68a" />
        </Pressable>
      ) : null}
      {showResume ? (
        <Pressable
          style={[
            styles.pause,
            { width: btnSize, height: btnSize },
            (stopping || busy) && styles.disabled,
          ]}
          onPress={onResume}
          disabled={stopping || busy}
          accessibilityLabel={SELLER_CONSOLE.resumeStream}
        >
          <Ionicons name="play" size={iconSize} color="#fde68a" />
        </Pressable>
      ) : null}
      <Pressable
        style={[
          showStop ? styles.stop : styles.play,
          compact && (showStop ? styles.stopCompact : styles.playCompact),
          { width: btnSize, height: btnSize },
          primaryDisabled && styles.disabled,
        ]}
        onPress={onPrimaryPress}
        disabled={primaryDisabled}
        accessibilityLabel={showStop ? SELLER_CONSOLE.stopStream : SELLER_CONSOLE.startStream}
      >
        {starting || stopping ? (
          <ActivityIndicator color={showStop ? '#fecdd3' : '#0a0a0a'} size="small" />
        ) : (
          <Ionicons
            name={showStop ? 'stop' : 'play'}
            size={iconSize}
            color={showStop ? '#fecdd3' : '#0a0a0a'}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  play: {
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 16,
    shadowColor: colors.gold,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  playCompact: {
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  pause: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    backgroundColor: 'rgba(69,26,3,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 16,
  },
  stop: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.55)',
    backgroundColor: 'rgba(76,5,25,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 16,
  },
  stopCompact: {
    borderColor: 'rgba(244,63,94,0.45)',
  },
  disabled: { opacity: 0.55 },
});
