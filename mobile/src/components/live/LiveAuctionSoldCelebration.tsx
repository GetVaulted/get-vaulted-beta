import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { formatAuctionMoneyUsd, type LiveAuctionCloseCelebration } from '../../lib/liveAuctionWinnerDisplay';
import { colors, spacing } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

type Props = {
  celebration: LiveAuctionCloseCelebration | null;
  onDone: () => void;
};

const DISPLAY_MS = 2800;

export function LiveAuctionSoldCelebration({ celebration, onDone }: Props) {
  useEffect(() => {
    if (!celebration) return undefined;
    const id = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(id);
  }, [celebration, onDone]);

  if (!celebration) return null;

  const sold = celebration.kind === 'sold';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <LiveRoomText style={styles.title}>{sold ? 'SOLD!' : 'Auction ended'}</LiveRoomText>
          {sold ? (
            <>
              <LiveRoomText style={styles.winner}>Winner: @{celebration.winnerUsername}</LiveRoomText>
              <LiveRoomText style={styles.amount}>{formatAuctionMoneyUsd(celebration.winningAmountUsd)}</LiveRoomText>
            </>
          ) : (
            <LiveRoomText style={styles.sub}>No bids</LiveRoomText>
          )}
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
  winner: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  amount: {
    color: '#86EFAC',
    fontSize: 28,
    fontWeight: '900',
  },
  sub: {
    color: '#D4D4D8',
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});
