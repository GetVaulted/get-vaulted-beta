import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveGiveawayRow } from '../../../api/liveGiveawayRepository';
import type { HostGiveawayAction } from '../../../hooks/useHostGiveawayActions';
import { spacing } from '../../../theme';
import { SellerHostGiveawayRail } from './SellerHostGiveawayRail';

type Props = {
  bottom: number;
  onShare: () => void;
  activeGiveaway?: LiveGiveawayRow | null;
  giveawayBusy?: boolean;
  onGiveawayAction?: (id: string, action: HostGiveawayAction) => void;
  onOpenGiveawayManage?: () => void;
};

/** Right-edge share + live giveaway host controls. */
export function SellerHostSideRail({
  bottom,
  onShare,
  activeGiveaway,
  giveawayBusy = false,
  onGiveawayAction,
  onOpenGiveawayManage,
}: Props) {
  return (
    <View style={[styles.rail, { bottom }]} pointerEvents="box-none">
      {activeGiveaway && onGiveawayAction && onOpenGiveawayManage ? (
        <SellerHostGiveawayRail
          giveaway={activeGiveaway}
          busy={giveawayBusy}
          onAction={onGiveawayAction}
          onOpenManage={onOpenGiveawayManage}
        />
      ) : null}
      <Pressable
        style={styles.railBtn}
        onPress={onShare}
        accessibilityLabel="Share show"
        hitSlop={6}
      >
        <Ionicons name="share-outline" size={22} color="rgba(255,255,255,0.92)" />
        <Text style={styles.railLabel}>Share</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: spacing.sm,
    alignItems: 'center',
    zIndex: 14,
  },
  railBtn: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    minWidth: 48,
  },
  railLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
});
