import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { SELLER_CONSOLE } from '../../../lib/sellerConsoleCopy';

type Props = {
  visible: boolean;
  compact?: boolean;
  muted: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** Toggle host microphone mute while previewing or broadcasting. */
export function SellerMicMuteButton({ visible, compact, muted, disabled, onPress }: Props) {
  if (!visible) return null;

  return (
    <Pressable
      style={[styles.btn, compact && styles.btnCompact, muted && styles.btnMuted, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={muted ? `Unmute ${SELLER_CONSOLE.microphone.toLowerCase()}` : `Mute ${SELLER_CONSOLE.microphone.toLowerCase()}`}
    >
      <Ionicons
        name={muted ? 'mic-off-outline' : 'mic-outline'}
        size={compact ? 17 : 22}
        color={muted ? '#fca5a5' : 'rgba(255,255,255,0.92)'}
      />
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
  btnMuted: {
    borderColor: 'rgba(248,113,113,0.55)',
    backgroundColor: 'rgba(127,29,29,0.42)',
  },
  disabled: { opacity: 0.45 },
});
