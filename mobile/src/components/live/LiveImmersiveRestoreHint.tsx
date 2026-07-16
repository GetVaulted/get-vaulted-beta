import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radii } from '../../theme';
import { LiveRoomText } from './LiveRoomText';

type Props = {
  visible: boolean;
  onPress: () => void;
  topInset: number;
};

/** Escape hatch when immersive swipe hides chrome (including Back). */
export function LiveImmersiveRestoreHint({ visible, onPress, topInset }: Props) {
  if (!visible) return null;

  return (
    <Pressable
      style={[styles.hint, { top: topInset + 72 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Show live controls"
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 16 }}
    >
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.92)" />
      <LiveRoomText style={styles.hintText}>UI</LiveRoomText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    left: 0,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingRight: 10,
    paddingLeft: 6,
    borderTopRightRadius: radii.pill,
    borderBottomRightRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  hintText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
