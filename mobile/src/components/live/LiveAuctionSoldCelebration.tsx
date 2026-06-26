import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import {
  formatLiveWinnerAnnouncement,
  type LiveAuctionCloseCelebration,
} from '../../lib/liveAuctionWinnerDisplay';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

type Props = {
  celebration: LiveAuctionCloseCelebration | null;
  onDone: () => void;
  viewerRole?: 'buyer' | 'seller';
};

const DISPLAY_MS = 2800;

/** Minimal winner flash — no backdrop card, room-wide "@user won (item)". */
export function LiveAuctionSoldCelebration({ celebration, onDone }: Props) {
  useEffect(() => {
    if (!celebration || celebration.kind !== 'sold') return undefined;
    const id = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(id);
  }, [celebration, onDone]);

  if (!celebration || celebration.kind !== 'sold') return null;

  const label = celebration.itemTitle?.trim() || 'Item';
  const line = formatLiveWinnerAnnouncement(celebration.winnerUsername, label);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <View style={styles.host} pointerEvents="none">
        <LiveRoomText style={styles.line}>{line}</LiveRoomText>
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
