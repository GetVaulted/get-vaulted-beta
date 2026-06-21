import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
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
};

/** Start stream opens the show; stop stream ends it for everyone. */
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
}: Props) {
  if (!stageEnabled) return null;

  const isBroadcasting = phase === 'live' || phase === 'paused' || phase === 'stopping';
  const stopping = phase === 'stopping';
  const roomEnded = roomStatus === 'ended';
  const showStart = !roomEnded && (phase === 'idle' || phase === 'starting') && cameraReady;
  const idleLabel = SELLER_CONSOLE.startStream;

  if (phase === 'paused') {
    return (
      <View style={styles.row}>
        <Pressable
          style={[compact ? styles.pauseCompact : styles.pause, busy && styles.disabled]}
          onPress={onResume}
          disabled={busy}
          accessibilityLabel={SELLER_CONSOLE.resumeStream}
        >
          <Text style={compact ? styles.pauseCompactTxt : styles.pauseTxt}>{SELLER_CONSOLE.resumeStream}</Text>
        </Pressable>
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
      </View>
    );
  }

  if (isBroadcasting) {
    return (
      <View style={styles.row}>
        {onPause && phase === 'live' ? (
          <Pressable
            style={[compact ? styles.pauseCompact : styles.pause, (stopping || busy) && styles.disabled]}
            onPress={onPause}
            disabled={stopping || busy}
            accessibilityLabel={SELLER_CONSOLE.pauseStream}
          >
            <Text style={compact ? styles.pauseCompactTxt : styles.pauseTxt}>{SELLER_CONSOLE.pauseStream}</Text>
          </Pressable>
        ) : null}
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
      </View>
    );
  }

  if (!showStart) return null;

  return (
    <Pressable
      style={[compact ? styles.startCompact : styles.start, busy && styles.disabled]}
      onPress={onStart}
      disabled={busy}
      accessibilityLabel={idleLabel}
    >
      {busy ? (
        <ActivityIndicator color="#0a0a0a" size="small" />
      ) : (
        <Text style={compact ? styles.startCompactTxt : styles.startTxt}>{idleLabel}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
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
  pause: {
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(46,36,8,0.82)',
    minWidth: 110,
    alignItems: 'center',
    zIndex: 16,
  },
  pauseTxt: {
    fontWeight: '900',
    fontSize: 13,
    color: colors.gold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  stop: {
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.55)',
    backgroundColor: 'rgba(76,5,25,0.72)',
    minWidth: 120,
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
  pauseCompact: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(46,36,8,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseCompactTxt: {
    fontWeight: '900',
    fontSize: 10,
    color: colors.gold,
    textTransform: 'uppercase',
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
