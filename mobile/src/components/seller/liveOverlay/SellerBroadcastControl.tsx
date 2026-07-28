import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MobileHostBroadcastPhase } from '../../../hooks/useMobileStagePublish';
import { confirmEndLive, confirmStartLive } from '../../../lib/sellerBroadcastConfirm';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';
import { colors, radii } from '../../../theme';

type Props = {
  phase: MobileHostBroadcastPhase;
  roomStatus: 'scheduled' | 'live' | 'ended';
  /** Server Host paused flag — show Play even if phase briefly still says live. */
  streamPaused?: boolean;
  /** Another device owns the camera — show companion chrome instead of Stop/Resume fight. */
  companionMode?: boolean;
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
  streamPaused = false,
  companionMode = false,
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
  const roomLive = roomStatus === 'live';
  const isOnAir = phase === 'live' || phase === 'paused' || stopping;
  const iconSize = headerCompact ? 15 : compact ? 18 : 20;
  const btnSize = headerCompact ? 32 : compact ? 44 : 48;

  if (
    companionMode &&
    phase !== 'live' &&
    phase !== 'paused' &&
    phase !== 'starting' &&
    phase !== 'stopping'
  ) {
    return (
      <View style={styles.row}>
        <View
          style={[styles.companionBadge, { height: btnSize, paddingHorizontal: headerCompact ? 8 : 10 }]}
          accessibilityLabel={SELLER_CONSOLE.companionLiveBadge}
        >
          <View style={styles.companionDot} />
          {!headerCompact ? (
            <Text style={styles.companionTxt} numberOfLines={1}>
              {SELLER_CONSOLE.companionLiveBadge}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={[
            styles.takeOver,
            { width: headerCompact ? undefined : btnSize + 36, height: btnSize, paddingHorizontal: headerCompact ? 8 : 10 },
            (!cameraReady || busy) && styles.disabled,
          ]}
          onPress={() => {
            if (!cameraReady || busy) return;
            confirmStartLive(onStart);
          }}
          disabled={!cameraReady || busy}
          accessibilityLabel={SELLER_CONSOLE.companionTakeOverCamera}
        >
          <Ionicons name="videocam-outline" size={iconSize} color="#ecfdf5" />
        </Pressable>
      </View>
    );
  }

  // Live room + idle (process remount / failed warm Play): still show Stop + Resume — do not
  // hide the whole control when cameraReady is briefly false (private shows hit this often).
  const needsLiveRecovery = roomLive && (phase === 'idle' || phase === 'starting' || streamPaused);
  const canShow = cameraReady || isOnAir || needsLiveRecovery;
  if (!canShow || roomEnded) return null;

  const showStop = isOnAir || needsLiveRecovery;
  const showResume =
    Boolean(onResume) &&
    (phase === 'paused' ||
      streamPaused ||
      (roomLive && (phase === 'idle' || phase === 'starting')));
  const showPause = showStop && phase === 'live' && !streamPaused && !showResume && Boolean(onPause);
  const starting = busy && (phase === 'idle' || phase === 'starting');
  const resuming = Boolean(busy && showResume);

  const onPrimaryPress = () => {
    if (showStop) {
      if (stopping || busy) return;
      confirmEndLive(onStop);
      return;
    }
    if (!cameraReady || busy || stopping) return;
    confirmStartLive(onStart);
  };

  const onResumePress = () => {
    if (busy || stopping) return;
    onResume?.();
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
          onPress={onResumePress}
          disabled={stopping || busy}
          accessibilityLabel={SELLER_CONSOLE.resumeStream}
        >
          {resuming ? (
            <ActivityIndicator color="#fde68a" size="small" />
          ) : (
            <Ionicons name="play" size={iconSize} color="#fde68a" />
          )}
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
        {starting || stopping || (busy && !showResume && showStop) ? (
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
  companionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.4)',
    backgroundColor: 'rgba(6,46,36,0.75)',
    paddingHorizontal: 10,
  },
  companionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6ee7b7',
  },
  companionTxt: {
    maxWidth: 88,
    color: '#ecfdf5',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  takeOver: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.55 },
});
