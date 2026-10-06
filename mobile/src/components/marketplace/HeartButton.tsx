import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { colors } from '../../theme';

/** Round save button that sits over a photo corner. */
export function HeartButton({
  saved,
  onPress,
  size = 28,
}: {
  saved: boolean;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from favorites' : 'Save to favorites'}
      accessibilityState={{ selected: saved }}
      style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Ionicons
        name={saved ? 'heart' : 'heart-outline'}
        size={Math.round(size * 0.52)}
        color={saved ? colors.gold : colors.textPrimary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    top: 6,
    right: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,5,0.62)',
  },
});
