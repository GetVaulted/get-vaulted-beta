import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
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
  compact?: boolean;
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
  compact,
}: Props) {
  if (!stageEnabled) return null;

  const isBroadcasting = phase === 'live' || phase === 'stopping';
  const stopping = phase === 'stopping';
  const showStart = (canStartRoom || (roomLive && phase === 'idle')) && cameraReady;
  const idleLabel = roomLive ? SELLER_CONSOLE.startStream : SELLER_CONSOLE.goLive;

  if (isBroadcasting) {
    return (
      <Pressable
        style={[compact ? styles.stopCompact : styles.stop, stopping && styles.disabled]}
        onPress={onStop}
        disabled={stopping || busy}
        accessibilityLabel={SELLER_CONSOLE.stopStream}
      >
        {stopping ? (
          <ActivityIndicator color="#fecdd3" size="small" />
        ) : (
          <Text style={compact ? styles.stopCompactTxt : styles.stopTxt}>{SELLER_CONSOLE.stopStream}</Text>
        )}
      </Pressable>
    );
  }

  if (!showStart) return null;

  return (
    <Pressable
      style={[compact ? styles.startCompact : styles.start, (phase === 'starting' || busy) && styles.disabled]}
      onPress={onStart}
      disabled={phase === 'starting' || busy}
      accessibilityLabel={idleLabel}
    >
      {phase === 'starting' || busy ? (
        <ActivityIndicator color="#0a0a0a" size="small" />
      ) : (
        <Text style={compact ? styles.startCompactTxt : styles.startTxt}>{idleLabel}</Text>
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
  startCompact: {
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startCompactTxt: {
    fontWeight: '900',
    fontSize: 11,
    color: '#0a0a0a',
  },
  stopCompact: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.55)',
    backgroundColor: 'rgba(76,5,25,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopCompactTxt: {
    fontWeight: '900',
    fontSize: 10,
    color: '#fecdd3',
    textTransform: 'uppercase',
  },
});
