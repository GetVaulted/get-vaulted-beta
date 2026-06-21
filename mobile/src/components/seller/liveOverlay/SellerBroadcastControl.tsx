import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
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
  compact?: boolean;
};

/** Single play/stop control — play starts live (with confirm), stop ends live (with confirm). */
export function SellerBroadcastControl({
  phase,
  roomStatus,
  stageEnabled,
  cameraReady,
  busy,
  onStart,
  onStop,
  compact,
}: Props) {
  if (!stageEnabled) return null;

  const stopping = phase === 'stopping';
  const roomEnded = roomStatus === 'ended';
  const isOnAir = phase === 'live' || phase === 'paused' || stopping;
  const canShow = cameraReady || isOnAir;
  if (!canShow || roomEnded) return null;

  const showStop = isOnAir;
  const starting = busy && (phase === 'idle' || phase === 'starting');
  const iconSize = compact ? 18 : 20;
  const btnSize = compact ? 44 : 48;

  const onPress = () => {
    if (showStop) {
      if (stopping || busy) return;
      confirmEndLive(onStop);
      return;
    }
    if (!cameraReady || busy || stopping) return;
    confirmStartLive(onStart);
  };

  return (
    <Pressable
      style={[
        showStop ? styles.stop : styles.play,
        compact && (showStop ? styles.stopCompact : styles.playCompact),
        { width: btnSize, height: btnSize },
        (stopping || (showStop ? busy : !cameraReady || busy)) && styles.disabled,
      ]}
      onPress={onPress}
      disabled={stopping || (showStop ? busy : !cameraReady || busy)}
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
  );
}

const styles = StyleSheet.create({
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
