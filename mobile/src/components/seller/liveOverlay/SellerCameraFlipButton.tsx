import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  compact?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** Toggle front/rear camera for seller host preview and live publish. */
export function SellerCameraFlipButton({ visible, compact, disabled, onPress }: Props) {
  if (!visible) return null;

  return (
    <Pressable
      style={[styles.btn, compact && styles.btnCompact, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Flip camera"
    >
      <Ionicons name="camera-reverse-outline" size={compact ? 17 : 22} color="rgba(255,255,255,0.92)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  btnCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  disabled: { opacity: 0.45 },
});
