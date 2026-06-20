import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { formatAuctionMoneyUsd } from '../../lib/liveAuctionWinnerDisplay';
import {
  spotCelebrationHeadline,
  SPOT_CELEBRATION_DISPLAY_MS,
  type LiveSpotTakenCelebration,
} from '../../lib/liveSpotCelebration';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

type Props = {
  celebration: LiveSpotTakenCelebration | null;
  onDone: () => void;
};

const DISPLAY_MS = SPOT_CELEBRATION_DISPLAY_MS;

export function LiveSpotTakenCelebration({ celebration, onDone }: Props) {
  useEffect(() => {
    if (!celebration) return undefined;
    const id = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(id);
  }, [celebration, onDone]);

  if (!celebration) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <LiveRoomText style={styles.title}>{spotCelebrationHeadline(celebration.kind)}</LiveRoomText>
          <LiveRoomText style={styles.username}>@{celebration.username}</LiveRoomText>
          <LiveRoomText style={styles.label}>{celebration.label}</LiveRoomText>
          {celebration.amountUsd > 0 ? (
            <LiveRoomText style={styles.amount}>{formatAuctionMoneyUsd(celebration.amountUsd)}</LiveRoomText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: '#111015',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.gold,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 1,
  },
  username: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  amount: {
    color: '#86EFAC',
    fontSize: 28,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
});
