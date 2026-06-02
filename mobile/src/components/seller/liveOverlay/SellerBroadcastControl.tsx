import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
import { colors, radii } from '../../../theme';

type Props = {
  phase: MobileHostBroadcastPhase;
  roomLive: boolean;
  canStartRoom: boolean;
  stageEnabled: boolean;
  cameraReady: boolean;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
};

/** Go Live / Start Stream / Stop Stream — mirrors web VaultBroadcastControl. */
export function SellerBroadcastControl({
  phase,
  roomLive,
  canStartRoom,
  stageEnabled,
  cameraReady,
  busy,
  onStart,
  onStop,
}: Props) {
  if (!stageEnabled) return null;

  const isBroadcasting = phase === 'live' || phase === 'stopping';
  const showStart = (canStartRoom || (roomLive && phase === 'idle')) && cameraReady;
  const idleLabel = roomLive ? 'Start stream' : 'Go live';

  if (isBroadcasting) {
    return (
      <Pressable
        style={[styles.stop, phase === 'stopping' && styles.disabled]}
        onPress={onStop}
        disabled={phase === 'stopping' || busy}
        accessibilityLabel="Stop stream"
      >
        {phase === 'stopping' ? (
          <ActivityIndicator color="#fecdd3" size="small" />
        ) : (
          <Text style={styles.stopTxt}>{phase === 'stopping' ? 'Stopping…' : 'Stop stream'}</Text>
        )}
      </Pressable>
    );
  }

  if (!showStart) return null;

  return (
    <Pressable
      style={[styles.start, (phase === 'starting' || busy) && styles.disabled]}
      onPress={onStart}
      disabled={phase === 'starting' || busy}
      accessibilityLabel={idleLabel}
    >
      {phase === 'starting' || busy ? (
        <ActivityIndicator color="#0a0a0a" size="small" />
      ) : (
        <Text style={styles.startTxt}>{idleLabel}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  start: {
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    minWidth: 160,
    alignItems: 'center',
    zIndex: 16,
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  startTxt: {
    fontWeight: '900',
    fontSize: 16,
    color: '#0a0a0a',
    letterSpacing: 0.3,
  },
  stop: {
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.55)',
    backgroundColor: 'rgba(76,5,25,0.72)',
    minWidth: 150,
    alignItems: 'center',
    zIndex: 16,
  },
  stopTxt: {
    fontWeight: '900',
    fontSize: 14,
    color: '#fecdd3',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  disabled: { opacity: 0.55 },
});
