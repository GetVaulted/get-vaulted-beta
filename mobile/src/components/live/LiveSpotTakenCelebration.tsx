import { useEffect, useRef } from 'react';
import { AppState, Modal, StyleSheet, View, type AppStateStatus } from 'react-native';
import { formatSpotWinnerAnnouncement, SPOT_CELEBRATION_DISPLAY_MS, type LiveSpotTakenCelebration } from '../../lib/liveSpotCelebration';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

type Props = {
  celebration: LiveSpotTakenCelebration | null;
  onDone: () => void;
};

const DISPLAY_MS = SPOT_CELEBRATION_DISPLAY_MS;

/** PYT/PYD spot win — "@user won (team/division)" with no backdrop card. */
export function LiveSpotTakenCelebration({ celebration, onDone }: Props) {
  const onDoneRef = useRef(onDone);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const dismissKey = celebration ? `${celebration.kind}|${celebration.username}|${celebration.label}` : null;

  useEffect(() => {
    if (!dismissKey) {
      shownAtRef.current = null;
      return undefined;
    }

    shownAtRef.current = Date.now();
    const id = setTimeout(() => onDoneRef.current(), DISPLAY_MS);

    const onAppState = (next: AppStateStatus) => {
      if (next !== 'active' || shownAtRef.current == null) return;
      if (Date.now() - shownAtRef.current >= DISPLAY_MS) {
        onDoneRef.current();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, [dismissKey]);

  if (!celebration) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.host} pointerEvents="none">
        <LiveRoomText style={styles.line}>{formatSpotWinnerAnnouncement(celebration)}</LiveRoomText>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  line: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
