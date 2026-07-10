import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../../theme';

type Props = {
  bottom: number;
  onShare: () => void;
  onNotes: () => void;
  hasNotes?: boolean;
};

/** Right-edge controls for the seller host console. */
export function SellerHostSideRail({ bottom, onShare, onNotes, hasNotes }: Props) {
  return (
    <View style={[styles.rail, { bottom }]} pointerEvents="box-none">
      <Pressable
        style={styles.railBtn}
        onPress={onNotes}
        accessibilityLabel={hasNotes ? 'Edit show notes' : 'Add show notes'}
        hitSlop={6}
      >
        <View>
          <Ionicons name="document-text-outline" size={22} color="rgba(255,255,255,0.92)" />
          {hasNotes ? <View style={styles.dot} /> : null}
        </View>
        <Text style={styles.railLabel}>Notes</Text>
      </Pressable>
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
    gap: spacing.md,
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
  dot: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.45)',
  },
});
