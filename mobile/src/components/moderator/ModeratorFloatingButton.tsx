import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { colors } from '../../theme';

type Props = {
  bottom: number;
  right: number;
  onPress: () => void;
};

export function ModeratorFloatingButton({ bottom, right, onPress }: Props) {
  return (
    <Pressable
      style={[styles.btn, { bottom, right }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open moderator tools"
    >
      <Ionicons name="shield-checkmark" size={20} color={colors.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    zIndex: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,128,0.35)',
  },
});
