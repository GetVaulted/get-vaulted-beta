import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing } from '../../../theme';

type Props = {
  bottom: number;
  onShare: () => void;
};

/** Right-edge share control for the seller host console. */
export function SellerHostSideRail({ bottom, onShare }: Props) {
  return (
    <View style={[styles.rail, { bottom }]} pointerEvents="box-none">
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
