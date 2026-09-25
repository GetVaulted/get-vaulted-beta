import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { colors } from '../../../theme';

type Props = {
  visible: boolean;
  compact?: boolean;
  disabled?: boolean;
  /** True when the seller has corrected (un-mirrored) the front-camera broadcast. */
  active?: boolean;
  onPress: () => void;
};

/**
 * Quick toggle for a mirrored front-camera broadcast — lets a seller whose background text/logos
 * appear backwards to buyers flip the actual outgoing video (and their own preview) to match.
 */
export function SellerMirrorFixButton({ visible, compact, disabled, active, onPress }: Props) {
  if (!visible) return null;

  return (
    <Pressable
      style={[
        styles.btn,
        compact && styles.btnCompact,
        active && styles.btnActive,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={active ? 'Mirrored video fix on' : 'Fix mirrored video'}
      accessibilityHint="Corrects backwards text or logos in your front-camera broadcast"
    >
      <Ionicons
        name="swap-horizontal-outline"
        size={compact ? 17 : 22}
        color={active ? colors.gold : 'rgba(255,255,255,0.92)'}
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
  btnActive: {
    backgroundColor: 'rgba(212,175,55,0.18)',
    borderColor: 'rgba(212,175,55,0.65)',
  },
  disabled: { opacity: 0.45 },
});
