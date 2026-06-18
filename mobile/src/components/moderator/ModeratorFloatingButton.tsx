import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { COMPOSER_BAR_HEIGHT } from '../../lib/liveRoomBottomLayout';
import { colors } from '../../theme';

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/** Inline accessory — sits left of the chat composer row. */
export function ModeratorToolsButton({
  onPress,
  accessibilityLabel = 'Open moderator tools',
}: Props) {
  return (
    <Pressable
      style={styles.btn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name="shield-checkmark" size={20} color={colors.gold} />
    </Pressable>
  );
}

export function HostModeratorAssignButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={styles.btn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Assign moderator"
    >
      <Ionicons name="person-add-outline" size={20} color="rgba(255,255,255,0.92)" />
    </Pressable>
  );
}

/** @deprecated Use ModeratorToolsButton inline beside composer. */
export function ModeratorFloatingButton({
  bottom,
  right,
  onPress,
}: {
  bottom: number;
  right: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[legacyStyles.legacyBtn, { bottom, right }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open moderator tools"
    >
      <Ionicons name="shield-checkmark" size={20} color={colors.gold} />
    </Pressable>
  );
}

const BTN_SIZE = COMPOSER_BAR_HEIGHT;

const styles = StyleSheet.create({
  btn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,215,128,0.35)',
  },
});

const legacyStyles = StyleSheet.create({
  legacyBtn: {
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
